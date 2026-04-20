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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a batched store with the given session ID', () => {
    createTelemetryManager({
      sessionId: 'test-session-id',
      getClient,
      projectId: 'abc123',
    })

    expect(createBatchedStore).toHaveBeenCalledWith(
      'test-session-id',
      expect.objectContaining({
        flushInterval: 30_000,
      }),
    )
  })

  it('logs session started with SDK version and provided data', () => {
    const manager = createTelemetryManager({
      sessionId: 'test-session-id',
      getClient,
      projectId: 'abc123',
    })

    const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value
    const logger = storeInstance.logger

    manager.logSessionStarted({
      projectId: 'abc123',
      perspective: 'published',
      authMethod: 'token',
    })

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({name: 'SDK Dev Session Started'}),
      expect.objectContaining({
        version: '2.8.0-test',
        projectId: 'abc123',
        perspective: 'published',
        authMethod: 'token',
      }),
    )
  })

  it('deduplicates hook first-used events by name', () => {
    const manager = createTelemetryManager({
      sessionId: 'test-session-id',
      getClient,
      projectId: 'abc123',
    })

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
    const manager = createTelemetryManager({
      sessionId: 'test-session-id',
      getClient,
      projectId: 'abc123',
    })

    manager.logHookFirstUsed('useQuery')
    manager.logHookFirstUsed('useDocument')

    expect(manager.hooksUsed).toEqual(new Set(['useQuery', 'useDocument']))
  })

  it('logs dev error events', () => {
    const manager = createTelemetryManager({
      sessionId: 'test-session-id',
      getClient,
      projectId: 'abc123',
    })

    const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value
    const logger = storeInstance.logger

    manager.logDevError('TypeError', 'documentStore')

    expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({name: 'SDK Dev Error'}), {
      errorType: 'TypeError',
      hookName: 'documentStore',
    })
  })

  it('logs session ended with duration and hooksUsed on endSession', () => {
    vi.useFakeTimers()

    const manager = createTelemetryManager({
      sessionId: 'test-session-id',
      getClient,
      projectId: 'abc123',
    })

    const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value
    const logger = storeInstance.logger

    manager.logHookFirstUsed('useQuery')

    vi.advanceTimersByTime(5000)

    manager.endSession()

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({name: 'SDK Dev Session Ended'}),
      expect.objectContaining({
        durationSeconds: 5,
        hooksUsed: ['useQuery'],
      }),
    )

    vi.useRealTimers()
  })

  describe('endSession teardown', () => {
    it('always uses flush + end (no sendBeacon due to auth header limitation)', () => {
      const manager = createTelemetryManager({
        sessionId: 'test-session-id',
        getClient,
        projectId: 'abc123',
      })

      const storeInstance = vi.mocked(createBatchedStore).mock.results[0].value

      manager.endSession()

      expect(storeInstance.flush).toHaveBeenCalled()
      expect(storeInstance.end).toHaveBeenCalled()
    })
  })

  describe('consent resolution', () => {
    it('checkConsent returns true when user has opted in', async () => {
      mockClient.request.mockResolvedValue({status: 'granted'})

      const manager = createTelemetryManager({
        sessionId: 'test-session-id',
        getClient,
        projectId: 'abc123',
      })

      const result = await manager.checkConsent()
      expect(result).toBe(true)
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({uri: '/intake/telemetry-status'}),
      )
    })

    it('checkConsent returns false when user has denied telemetry', async () => {
      mockClient.request.mockResolvedValue({status: 'denied'})

      const manager = createTelemetryManager({
        sessionId: 'test-session-id',
        getClient,
        projectId: 'abc123',
      })

      expect(await manager.checkConsent()).toBe(false)
    })

    it('checkConsent returns false when consent is unset', async () => {
      mockClient.request.mockResolvedValue({status: 'unset'})

      const manager = createTelemetryManager({
        sessionId: 'test-session-id',
        getClient,
        projectId: 'abc123',
      })

      expect(await manager.checkConsent()).toBe(false)
    })

    it('checkConsent returns false on network failure', async () => {
      mockClient.request.mockRejectedValue(new Error('Network error'))

      const manager = createTelemetryManager({
        sessionId: 'test-session-id',
        getClient,
        projectId: 'abc123',
      })

      expect(await manager.checkConsent()).toBe(false)
    })

    it('caches consent after the first call', async () => {
      mockClient.request.mockResolvedValue({status: 'granted'})

      createTelemetryManager({
        sessionId: 'test-session-id',
        getClient,
        projectId: 'abc123',
      })

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
