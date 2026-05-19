import {createBatchedStore} from '@sanity/telemetry'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createTelemetryManager} from './telemetryManager'

vi.mock('@sanity/telemetry', () => {
  const mockLogger = {
    log: vi.fn(),
    updateUserProperties: vi.fn(),
    resume: vi.fn(),
    trace: vi.fn(),
  }
  return {
    createBatchedStore: vi.fn(() => ({
      logger: mockLogger,
      end: vi.fn(),
      flush: vi.fn(() => Promise.resolve()),
    })),
    defineEvent: vi.fn((opts) => ({
      type: 'log' as const,
      name: opts.name,
      version: opts.version,
      description: opts.description,
      schema: undefined as never,
    })),
  }
})

vi.mock('../version', () => ({
  CORE_SDK_VERSION: '2.8.0-test',
}))

describe('createTelemetryManager', () => {
  const mockClient = {
    request: vi.fn((): Promise<unknown> => Promise.resolve()),
    getUrl: vi.fn((path: string) => `https://abc123.api.sanity.io/v2024-11-12${path}`),
  }

  const getClient = () => mockClient as never

  const baseOptions = {
    sessionId: 'test-session-id',
    getClient,
    projectId: 'abc123',
    environment: 'development' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a batched store with the given session ID', () => {
    createTelemetryManager(baseOptions)

    expect(createBatchedStore).toHaveBeenCalledWith(
      'test-session-id',
      expect.objectContaining({
        flushInterval: 30_000,
      }),
    )
  })

  it('logs session started with SDK version and provided data', () => {
    const manager = createTelemetryManager(baseOptions)

    const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value
    const logger = storeInstance.logger

    manager.logSessionStarted({
      projectId: 'abc123',
      perspective: 'published',
      authMethod: 'token',
    })

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({name: 'SDK Session Started'}),
      expect.objectContaining({
        version: '2.8.0-test',
        projectId: 'abc123',
        perspective: 'published',
        authMethod: 'token',
      }),
    )
  })

  it('deduplicates hook first-used events by name', () => {
    const manager = createTelemetryManager(baseOptions)

    const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value
    const logger = storeInstance.logger

    manager.logHookFirstUsed('useQuery')
    manager.logHookFirstUsed('useQuery')
    manager.logHookFirstUsed('useDocument')

    const hookCalls = vi
      .mocked(logger.log)
      .mock.calls.filter(([event]: [{name: string}]) => event.name === 'SDK Hook Mounted')
    expect(hookCalls).toHaveLength(2)
    expect(hookCalls[0][1]).toEqual({hookName: 'useQuery'})
    expect(hookCalls[1][1]).toEqual({hookName: 'useDocument'})
  })

  it('tracks hooksUsed set', () => {
    const manager = createTelemetryManager(baseOptions)

    manager.logHookFirstUsed('useQuery')
    manager.logHookFirstUsed('useDocument')

    expect(manager.hooksUsed).toEqual(new Set(['useQuery', 'useDocument']))
  })

  it('logs error events', () => {
    const manager = createTelemetryManager(baseOptions)

    const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value
    const logger = storeInstance.logger

    manager.logError('TypeError', 'documentStore')

    expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({name: 'SDK Error'}), {
      errorType: 'TypeError',
      hookName: 'documentStore',
    })
  })

  it('logs session ended with duration and hooksUsed on endSession', () => {
    vi.useFakeTimers()

    const manager = createTelemetryManager(baseOptions)

    const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value
    const logger = storeInstance.logger

    manager.logHookFirstUsed('useQuery')

    vi.advanceTimersByTime(5000)

    manager.endSession()

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({name: 'SDK Session Ended'}),
      expect.objectContaining({
        durationSeconds: 5,
        hooksUsed: ['useQuery'],
      }),
    )

    vi.useRealTimers()
  })

  describe('environment context', () => {
    type EnrichedContext = {
      environment?: string
      version?: string
      origin?: string
      traceCorrelationId?: string
    }
    type EnrichedEvent = {
      type?: string
      name?: string
      version?: number
      traceId?: string
      sessionId?: string
      createdAt?: string
      data?: unknown
      context: EnrichedContext
    }
    const getRequestBody = () => {
      const [args] = mockClient.request.mock.calls as unknown as Array<
        [{body: {batch: EnrichedEvent[]}}]
      >
      return args[0].body
    }

    it('records "development" in the enriched batch context and preserves the event payload', async () => {
      createTelemetryManager({...baseOptions, environment: 'development'})

      const storeOptions = vi.mocked(createBatchedStore).mock.calls[0][1]
      await storeOptions.sendEvents([
        {
          type: 'log',
          version: 1,
          name: 'SDK Session Started',
          sessionId: 'test-session-id',
          createdAt: '2026-01-01T00:00:00Z',
          data: {projectId: 'p1'},
        } as never,
      ])

      const [event] = getRequestBody().batch
      expect(event.context.environment).toBe('development')
      expect(event.type).toBe('log')
      expect(event.name).toBe('SDK Session Started')
      expect(event.version).toBe(1)
      expect(event.sessionId).toBe('test-session-id')
      expect(event.data).toEqual({projectId: 'p1'})
    })

    it('records "production" in the enriched batch context', async () => {
      createTelemetryManager({...baseOptions, environment: 'production'})

      const storeOptions = vi.mocked(createBatchedStore).mock.calls[0][1]
      await storeOptions.sendEvents([
        {
          type: 'log',
          version: 1,
          name: 'SDK Session Started',
          sessionId: 'test-session-id',
          createdAt: '2026-01-01T00:00:00Z',
          data: {},
        } as never,
      ])

      expect(getRequestBody().batch[0].context.environment).toBe('production')
    })

    it('preserves pre-existing context fields from trace events and lets SDK fields take precedence on conflict', async () => {
      // Trace events from `@sanity/telemetry` arrive with a top-level
      // `context` (see `TelemetryTraceStartEvent`, etc.). Replacing rather
      // than merging would silently drop those fields. The SDK-managed
      // fields (`version`, `environment`, `origin`) should also win on key
      // collision so they remain authoritative. The rest of the trace
      // event (`type`, `name`, `traceId`, `sessionId`, `createdAt`) must
      // survive — downstream consumers (Rudderstack via telemetry-sink)
      // read those fields directly off each batch entry.
      createTelemetryManager({...baseOptions, environment: 'production'})

      const storeOptions = vi.mocked(createBatchedStore).mock.calls[0][1]
      await storeOptions.sendEvents([
        {
          type: 'trace.start',
          name: 'some.trace',
          version: 1,
          traceId: 't1',
          sessionId: 'test-session-id',
          createdAt: '2026-01-01T00:00:00Z',
          context: {
            traceCorrelationId: 'abc-123',
            environment: 'should-be-overwritten',
          },
        } as never,
      ])

      const [event] = getRequestBody().batch
      expect(event.context.traceCorrelationId).toBe('abc-123')
      expect(event.context.environment).toBe('production')
      expect(event.context.version).toBe('2.8.0-test')
      expect(event.type).toBe('trace.start')
      expect(event.name).toBe('some.trace')
      expect(event.traceId).toBe('t1')
      expect(event.sessionId).toBe('test-session-id')
      expect(event.createdAt).toBe('2026-01-01T00:00:00Z')
    })
  })

  describe('endSession teardown', () => {
    it('always uses flush + end (no sendBeacon due to auth header limitation)', () => {
      const manager = createTelemetryManager(baseOptions)

      const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value

      manager.endSession()

      expect(storeInstance.flush).toHaveBeenCalled()
      expect(storeInstance.end).toHaveBeenCalled()
    })
  })

  describe('consent resolution', () => {
    it('checkConsent returns true when user has opted in', async () => {
      mockClient.request.mockResolvedValue({status: 'granted'})

      const manager = createTelemetryManager(baseOptions)

      const result = await manager.checkConsent()
      expect(result).toBe(true)
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({uri: '/intake/telemetry-status'}),
      )
    })

    it('checkConsent returns false when user has denied telemetry', async () => {
      mockClient.request.mockResolvedValue({status: 'denied'})

      const manager = createTelemetryManager(baseOptions)

      expect(await manager.checkConsent()).toBe(false)
    })

    it('checkConsent returns false when consent is unset', async () => {
      mockClient.request.mockResolvedValue({status: 'unset'})

      const manager = createTelemetryManager(baseOptions)

      expect(await manager.checkConsent()).toBe(false)
    })

    it('checkConsent returns false on network failure', async () => {
      mockClient.request.mockRejectedValue(new Error('Network error'))

      const manager = createTelemetryManager(baseOptions)

      expect(await manager.checkConsent()).toBe(false)
    })

    it('caches consent after the first call', async () => {
      mockClient.request.mockResolvedValue({status: 'granted'})

      createTelemetryManager(baseOptions)

      const storeOptions = vi.mocked(createBatchedStore).mock.calls[0][1]
      const resolveConsent = storeOptions.resolveConsent

      const first = await resolveConsent()
      const second = await resolveConsent()

      expect(first).toEqual({status: 'granted'})
      expect(second).toEqual({status: 'granted'})
      expect(mockClient.request).toHaveBeenCalledTimes(1)
    })
  })
})
