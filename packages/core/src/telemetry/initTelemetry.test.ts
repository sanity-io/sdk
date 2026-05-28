import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getTokenState} from '../auth/authStore'
import {createSanityInstance} from '../store/createSanityInstance'
import {getTelemetryEnvironment} from './environment'
import {getTelemetryManager, initTelemetry, trackHookMounted} from './initTelemetry'
import {createTelemetryManager} from './telemetryManager'

vi.mock('./environment', () => ({
  getTelemetryEnvironment: vi.fn(() => null),
}))

vi.mock('./telemetryManager', () => ({
  createTelemetryManager: vi.fn(() => ({
    checkConsent: vi.fn(() => Promise.resolve(true)),
    logSessionStarted: vi.fn(),
    logHookFirstUsed: vi.fn(),
    logError: vi.fn(),
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

type TokenSubscriber = (token: string | null) => void

/**
 * Mimics the real token state: a BehaviorSubject-like observable that
 * remembers the latest value and lets the test push new ones. The real
 * `getTokenState(instance).observable` is `shareReplay({bufferSize: 1, refCount: true})`,
 * so we also model the option to emit synchronously on subscribe.
 */
function createControlledTokenState(
  options: {
    initial?: string | null
    /** If set, the observable emits this value synchronously on subscribe. */
    emitOnSubscribe?: string | null
  } = {},
) {
  const subscribers = new Set<TokenSubscriber>()
  let current: string | null = options.initial ?? null

  const tokenState = {
    getCurrent: vi.fn(() => current),
    subscribe: vi.fn(() => () => {}),
    observable: {
      subscribe: vi.fn((cb: TokenSubscriber) => {
        subscribers.add(cb)
        if (options.emitOnSubscribe !== undefined) {
          current = options.emitOnSubscribe
          cb(current)
        }
        return {
          unsubscribe: vi.fn(() => {
            subscribers.delete(cb)
          }),
        }
      }),
    },
  } as unknown as ReturnType<typeof getTokenState>

  return {
    tokenState,
    emit(token: string | null) {
      current = token
      for (const cb of [...subscribers]) cb(token)
    },
    subscriberCount: () => subscribers.size,
  }
}

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

  it('does nothing when the environment is not eligible', async () => {
    vi.mocked(getTelemetryEnvironment).mockReturnValue(null)

    const instance = createSanityInstance()

    initTelemetry(instance, 'abc123')
    await flushPromises()

    expect(createTelemetryManager).not.toHaveBeenCalled()
    instance.dispose()
  })

  it('does nothing when no projectId is provided', async () => {
    vi.mocked(getTelemetryEnvironment).mockReturnValue('development')

    const instance = createSanityInstance()
    initTelemetry(instance, '')
    await flushPromises()

    expect(createTelemetryManager).not.toHaveBeenCalled()
    instance.dispose()
  })

  it('initializes telemetry in development mode with a projectId', async () => {
    vi.mocked(getTelemetryEnvironment).mockReturnValue('development')

    const instance = createSanityInstance()

    initTelemetry(instance, 'abc123')
    await flushPromises()

    expect(createTelemetryManager).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: instance.instanceId,
        projectId: 'abc123',
        environment: 'development',
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

  it('initializes telemetry in production mode on a Sanity-controlled domain', async () => {
    vi.mocked(getTelemetryEnvironment).mockReturnValue('production')

    const instance = createSanityInstance()

    initTelemetry(instance, 'abc123')
    await flushPromises()

    expect(createTelemetryManager).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: instance.instanceId,
        projectId: 'abc123',
        environment: 'production',
      }),
    )

    instance.dispose()
  })

  it('registers manager in the WeakMap', async () => {
    vi.mocked(getTelemetryEnvironment).mockReturnValue('development')

    const instance = createSanityInstance()

    initTelemetry(instance, 'abc123')
    await flushPromises()

    expect(getTelemetryManager(instance)).toBeDefined()

    instance.dispose()
  })

  it('does not initialize if instance is already disposed', async () => {
    vi.mocked(getTelemetryEnvironment).mockReturnValue('development')

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
    vi.mocked(getTelemetryEnvironment).mockReturnValue('development')

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
    vi.mocked(getTelemetryEnvironment).mockReturnValue('development')

    const instance = createSanityInstance()

    vi.mocked(createTelemetryManager).mockReturnValueOnce({
      checkConsent: vi.fn(() => Promise.resolve(false)),
      logSessionStarted: vi.fn(),
      logHookFirstUsed: vi.fn(),
      logError: vi.fn(),
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
    vi.mocked(getTelemetryEnvironment).mockReturnValue('development')

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
    vi.mocked(getTelemetryEnvironment).mockReturnValue('development')

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

  it('does not buffer hooks when the environment is not eligible', async () => {
    vi.mocked(getTelemetryEnvironment).mockReturnValue(null)

    const instance = createSanityInstance()

    trackHookMounted(instance, 'useQuery')

    vi.mocked(getTelemetryEnvironment).mockReturnValue('production')
    initTelemetry(instance, 'abc123')
    await flushPromises()

    const manager = vi.mocked(createTelemetryManager).mock.results[0].value
    expect(manager.logHookFirstUsed).not.toHaveBeenCalled()

    instance.dispose()
  })

  describe('auth token wait', () => {
    beforeEach(() => {
      vi.mocked(getTelemetryEnvironment).mockReturnValue('development')
    })

    it('defers initialization until the token observable emits', async () => {
      const handle = createControlledTokenState({initial: null})
      vi.mocked(getTokenState).mockReturnValue(handle.tokenState)

      const instance = createSanityInstance()
      initTelemetry(instance, 'abc123')
      await flushPromises()

      // No token yet — manager construction must not have happened.
      expect(createTelemetryManager).not.toHaveBeenCalled()
      expect(handle.subscriberCount()).toBe(1)

      handle.emit('real-token')
      await flushPromises()

      expect(createTelemetryManager).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'abc123', environment: 'development'}),
      )
      const manager = vi.mocked(createTelemetryManager).mock.results[0].value
      expect(manager.logSessionStarted).toHaveBeenCalled()

      instance.dispose()
    })

    it('ignores empty token emissions and keeps waiting', async () => {
      const handle = createControlledTokenState({initial: null})
      vi.mocked(getTokenState).mockReturnValue(handle.tokenState)

      const instance = createSanityInstance()
      initTelemetry(instance, 'abc123')
      await flushPromises()

      // Empty/falsy emissions should not be treated as a real token.
      handle.emit(null)
      handle.emit('')
      await flushPromises()

      expect(createTelemetryManager).not.toHaveBeenCalled()
      expect(handle.subscriberCount()).toBe(1)

      handle.emit('real-token')
      await flushPromises()

      expect(createTelemetryManager).toHaveBeenCalledTimes(1)

      instance.dispose()
    })

    it('unsubscribes from the token observable once a token arrives', async () => {
      const handle = createControlledTokenState({initial: null})
      vi.mocked(getTokenState).mockReturnValue(handle.tokenState)

      const instance = createSanityInstance()
      initTelemetry(instance, 'abc123')
      await flushPromises()

      expect(handle.subscriberCount()).toBe(1)
      handle.emit('real-token')
      await flushPromises()

      expect(handle.subscriberCount()).toBe(0)

      instance.dispose()
    })

    it('aborts and unsubscribes when the instance is disposed during the wait', async () => {
      const handle = createControlledTokenState({initial: null})
      vi.mocked(getTokenState).mockReturnValue(handle.tokenState)

      const instance = createSanityInstance()
      initTelemetry(instance, 'abc123')
      await flushPromises()

      expect(handle.subscriberCount()).toBe(1)

      instance.dispose()
      await flushPromises()

      expect(createTelemetryManager).not.toHaveBeenCalled()
      expect(handle.subscriberCount()).toBe(0)
      expect(getTelemetryManager(instance)).toBeUndefined()
    })

    it('does not re-subscribe to the token observable after a disposed-wait abort', async () => {
      // Regression guard: if initInFlight isn't cleared on the dispose-abort
      // branch, a follow-up initTelemetry call on the same instance would be
      // silently dropped instead of bailing on the env/projectId check.
      const handle = createControlledTokenState({initial: null})
      vi.mocked(getTokenState).mockReturnValue(handle.tokenState)

      const instance = createSanityInstance()
      initTelemetry(instance, 'abc123')
      await flushPromises()

      instance.dispose()
      await flushPromises()

      // A second call against the same (disposed) instance should be a no-op
      // and must not leave dangling subscriptions.
      initTelemetry(instance, 'abc123')
      await flushPromises()

      expect(handle.subscriberCount()).toBe(0)
      expect(createTelemetryManager).not.toHaveBeenCalled()
    })

    it('handles a synchronous token emission on subscribe without crashing', async () => {
      // The real `getTokenState(instance).observable` is shareReplay({bufferSize: 1}),
      // which means a subscribe call can deliver a buffered value synchronously
      // before `subscribe()` itself returns. If `getCurrent()` saw `null` but the
      // token landed in the buffer in the gap before `.subscribe(cb)`, the callback
      // fires with a real token while `sub` is still in the TDZ. The init flow must
      // not crash in that race.
      const handle = createControlledTokenState({
        initial: null,
        emitOnSubscribe: 'sync-token',
      })
      vi.mocked(getTokenState).mockReturnValue(handle.tokenState)

      const instance = createSanityInstance()
      initTelemetry(instance, 'abc123')

      // Must resolve without an unhandled rejection.
      await flushPromises()

      expect(createTelemetryManager).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'abc123'}),
      )
      expect(handle.subscriberCount()).toBe(0)

      instance.dispose()
    })
  })
})
