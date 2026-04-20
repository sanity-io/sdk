import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {isDevMode} from './devMode'
import {getTelemetryManager, initTelemetry, trackHookMounted} from './initTelemetry'
import {createTelemetryManager} from './telemetryManager'

vi.mock('./devMode', () => ({
  isDevMode: vi.fn(() => false),
}))

vi.mock('./telemetryManager', () => ({
  createTelemetryManager: vi.fn(() => ({
    checkConsent: vi.fn(() => Promise.resolve(true)),
    logSessionStarted: vi.fn(),
    logHookFirstUsed: vi.fn(),
    logDevError: vi.fn(),
    endSession: vi.fn(),
    dispose: vi.fn(),
    hooksUsed: new Set(),
  })),
}))

vi.mock('../client/clientStore', () => ({
  getClient: vi.fn(() => ({})),
}))

vi.mock('../auth/authStore', () => ({
  getTokenState: vi.fn(() => ({
    getCurrent: vi.fn(() => 'mock-token'),
    observable: {subscribe: vi.fn()},
  })),
}))

/**
 * Flush the microtask queue so the dynamic imports in initTelemetry
 * have time to resolve before assertions run.
 */
const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0))

describe('initTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing when dev mode is disabled', async () => {
    vi.mocked(isDevMode).mockReturnValue(false)

    const instance = createSanityInstance()

    initTelemetry(instance, 'abc123')
    await flushPromises()

    expect(createTelemetryManager).not.toHaveBeenCalled()
    instance.dispose()
  })

  it('does nothing when no projectId is provided', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const instance = createSanityInstance()
    initTelemetry(instance, '')
    await flushPromises()

    expect(createTelemetryManager).not.toHaveBeenCalled()
    instance.dispose()
  })

  it('initializes telemetry in dev mode with a projectId', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const instance = createSanityInstance()

    initTelemetry(instance, 'abc123')
    await flushPromises()

    expect(createTelemetryManager).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: instance.instanceId,
        projectId: 'abc123',
      }),
    )

    const manager = vi.mocked(createTelemetryManager).mock.results[0].value
    expect(manager.logSessionStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'abc123',
        perspective: 'published',
      }),
    )

    instance.dispose()
  })

  it('registers manager in the WeakMap', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const instance = createSanityInstance()

    initTelemetry(instance, 'abc123')
    await flushPromises()

    expect(getTelemetryManager(instance)).toBeDefined()

    instance.dispose()
  })

  it('does not initialize if instance is already disposed', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const instance = createSanityInstance()

    instance.dispose()
    initTelemetry(instance, 'abc123')
    await flushPromises()

    const manager = vi.mocked(createTelemetryManager).mock.results[0]?.value
    if (manager) {
      expect(manager.logSessionStarted).not.toHaveBeenCalled()
    }
  })

  it('calls endSession and removes manager on instance dispose', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const instance = createSanityInstance()

    initTelemetry(instance, 'abc123')
    await flushPromises()

    const manager = vi.mocked(createTelemetryManager).mock.results[0].value
    expect(getTelemetryManager(instance)).toBeDefined()

    instance.dispose()

    expect(manager.endSession).toHaveBeenCalled()
    expect(getTelemetryManager(instance)).toBeUndefined()
  })

  it('skips telemetry entirely when user has not opted in', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const instance = createSanityInstance()

    vi.mocked(createTelemetryManager).mockReturnValueOnce({
      checkConsent: vi.fn(() => Promise.resolve(false)),
      logSessionStarted: vi.fn(),
      logHookFirstUsed: vi.fn(),
      logDevError: vi.fn(),
      endSession: vi.fn(),
      dispose: vi.fn(),
      hooksUsed: new Set(),
    })

    initTelemetry(instance, 'abc123')
    await flushPromises()

    expect(createTelemetryManager).toHaveBeenCalled()
    const manager = vi.mocked(createTelemetryManager).mock.results[0].value

    expect(manager.logSessionStarted).not.toHaveBeenCalled()
    expect(manager.dispose).toHaveBeenCalled()
    expect(manager.endSession).not.toHaveBeenCalled()
    expect(getTelemetryManager(instance)).toBeUndefined()

    instance.dispose()
  })

  it('uses perspective from config when available', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const instance = createSanityInstance({perspective: 'previewDrafts'})

    initTelemetry(instance, 'abc123')
    await flushPromises()

    const manager = vi.mocked(createTelemetryManager).mock.results[0].value
    expect(manager.logSessionStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        perspective: 'previewDrafts',
      }),
    )

    instance.dispose()
  })

  it('flushes hooks buffered before manager is ready', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const instance = createSanityInstance()

    trackHookMounted(instance, 'useQuery')
    trackHookMounted(instance, 'useDocument')

    initTelemetry(instance, 'abc123')
    await flushPromises()

    const manager = vi.mocked(createTelemetryManager).mock.results[0].value
    expect(manager.logHookFirstUsed).toHaveBeenCalledWith('useQuery')
    expect(manager.logHookFirstUsed).toHaveBeenCalledWith('useDocument')

    instance.dispose()
  })

  it('finds manager through parent-child instance chain', async () => {
    vi.mocked(isDevMode).mockReturnValue(true)

    const root = createSanityInstance()
    const child = root.createChild({})

    initTelemetry(root, 'abc123')
    await flushPromises()

    trackHookMounted(child, 'useUsers')

    const manager = vi.mocked(createTelemetryManager).mock.results[0].value
    expect(manager.logHookFirstUsed).toHaveBeenCalledWith('useUsers')

    root.dispose()
  })
})
