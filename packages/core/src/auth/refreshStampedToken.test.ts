import {of, Subscription, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {createStoreState} from '../store/createStoreState'
import {AuthStateType} from './authStateType'
import {type AuthState, authStore} from './authStore'
import {refreshStampedToken} from './refreshStampedToken'

type LockGrantedCallback = (lock: Lock | null) => Promise<boolean>

interface Lock {
  name: string
  mode: 'exclusive' | 'shared'
}

interface LockOptions {
  mode: 'exclusive' | 'shared'
}

describe('refreshStampedToken', () => {
  let mockStorage: Storage
  let originalNavigator: typeof navigator
  let subscriptions: Subscription[]

  beforeEach(() => {
    subscriptions = []
    vi.clearAllMocks()
    originalNavigator = global.navigator
    mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    }
    const mockLocks = {
      request: vi.fn(
        async (
          _name: string,
          _options: LockOptions | LockGrantedCallback,
          callback?: LockGrantedCallback,
        ) => {
          const actualCallback = typeof _options === 'function' ? _options : callback
          if (!actualCallback) return false
          const mockLock: Lock = {name: 'mock-lock', mode: 'exclusive'}
          try {
            await new Promise((resolve) => setTimeout(resolve, 0))
            await actualCallback(mockLock)
            return true
          } catch {
            return false
          }
        },
      ),
      query: vi.fn(async () => ({held: [], pending: []})),
    }
    Object.defineProperty(global, 'navigator', {
      value: {locks: mockLocks},
      writable: true,
    })
  })

  afterEach(async () => {
    subscriptions.forEach((sub) => sub.unsubscribe())
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    })
    await new Promise((resolve) => setImmediate(resolve))
  })

  describe('dashboard context', () => {
    it('refreshes the token after REFRESH_INTERVAL without using locks', async () => {
      vi.useFakeTimers()
      try {
        const mockClient = {
          observable: {
            request: vi.fn(() => of({token: 'sk-refreshed-token-st123'})),
          },
        }
        const mockClientFactory = vi.fn().mockReturnValue(mockClient)
        const instance = createSanityInstance({
          projectId: 'p',
          dataset: 'd',
          auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
        })
        const initialState = authStore.getInitialState(instance)
        initialState.authState = {
          type: AuthStateType.LOGGED_IN,
          token: 'sk-initial-token-st123',
          currentUser: null,
        }
        initialState.dashboardContext = {mode: 'test'}
        const state = createStoreState(initialState)
        const subscription = refreshStampedToken({state, instance})
        subscriptions.push(subscription)

        // Assert refresh doesn't happen immediately
        expect(mockClient.observable.request).not.toHaveBeenCalled()
        const intermediateAuthState = state.get().authState
        expect(intermediateAuthState.type).toBe(AuthStateType.LOGGED_IN)
        if (intermediateAuthState.type === AuthStateType.LOGGED_IN) {
          expect(intermediateAuthState.token).toBe('sk-initial-token-st123')
        }

        // Run pending timers (should trigger the refresh after the interval)
        vi.runOnlyPendingTimers()

        // Check refresh happened now
        expect(mockClient.observable.request).toHaveBeenCalledTimes(1)
        const finalAuthStateDash = state.get().authState
        expect(finalAuthStateDash.type).toBe(AuthStateType.LOGGED_IN)
        if (finalAuthStateDash.type === AuthStateType.LOGGED_IN) {
          expect(finalAuthStateDash.token).toBe('sk-refreshed-token-st123')
        }
        expect(navigator.locks.request).not.toHaveBeenCalled() // Still shouldn't use locks
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('non-dashboard context', () => {
    it('uses Web Locks API to coordinate token refresh', async () => {
      const mockClient = {
        observable: {
          request: vi.fn(() => of({token: 'sk-refreshed-token-st123'})),
        },
      }
      const mockClientFactory = vi.fn().mockReturnValue(mockClient)
      const instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
      })
      const initialState = authStore.getInitialState(instance)
      initialState.authState = {
        type: AuthStateType.LOGGED_IN,
        token: 'sk-initial-token-st123',
        currentUser: null,
      }
      const state = createStoreState(initialState)
      const subscription = refreshStampedToken({state, instance})
      subscriptions.push(subscription)

      // Wait briefly for state to settle
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Check final state and that lock was attempted
      expect(navigator.locks.request).toHaveBeenCalled()
      const finalAuthStateNonDash = state.get().authState
      expect(finalAuthStateNonDash.type).toBe(AuthStateType.LOGGED_IN)
      if (finalAuthStateNonDash.type === AuthStateType.LOGGED_IN) {
        expect(finalAuthStateNonDash.token).toBe('sk-refreshed-token-st123')
      }
    })

    it('skips refresh if lock cannot be acquired', async () => {
      const mockLocks = {
        request: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return false
        }),
        query: vi.fn(async () => ({held: [], pending: []})),
      }
      Object.defineProperty(global, 'navigator', {value: {locks: mockLocks}, writable: true})
      const mockClient = {
        observable: {request: vi.fn(() => of({token: 'sk-refreshed-token-st123'}))},
      }
      const mockClientFactory = vi.fn().mockReturnValue(mockClient)
      const instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
      })
      const initialState = authStore.getInitialState(instance)
      initialState.authState = {
        type: AuthStateType.LOGGED_IN,
        token: 'sk-initial-token-st123',
        currentUser: null,
      }
      const state = createStoreState(initialState)
      const subscription = refreshStampedToken({state, instance})
      subscriptions.push(subscription)

      // Wait briefly
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Check lock was attempted, client request was NOT, and state is unchanged
      expect(navigator.locks.request).toHaveBeenCalledTimes(1)
      expect(mockClient.observable.request).not.toHaveBeenCalled()
      expect(state.get().authState).toEqual({
        type: AuthStateType.LOGGED_IN,
        token: 'sk-initial-token-st123',
        currentUser: null,
      })
    })
  })

  it('sets an error state when token refresh fails', async () => {
    vi.useFakeTimers()
    try {
      const error = new Error('Refresh failed')
      const mockClient = {
        observable: {
          request: vi.fn(() => throwError(() => error)),
        },
      }
      const mockClientFactory = vi.fn().mockReturnValue(mockClient)
      const instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
      })
      const initialState = authStore.getInitialState(instance)
      initialState.authState = {
        type: AuthStateType.LOGGED_IN,
        token: 'sk-initial-token-st123',
        currentUser: null,
      }
      initialState.dashboardContext = {mode: 'test'}
      const state = createStoreState(initialState)
      const subscription = refreshStampedToken({state, instance})
      subscriptions.push(subscription)

      // Run timers and allow error propagation
      vi.runOnlyPendingTimers()

      // Check final state IS error
      const finalAuthStateError = state.get().authState
      expect(finalAuthStateError.type).toBe(AuthStateType.ERROR)
      if (finalAuthStateError.type === AuthStateType.ERROR) {
        expect(finalAuthStateError.error).toBe(error)
      } else {
        expect.fail('Expected authState type to be ERROR')
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing if user is not logged in', async () => {
    const mockClientFactory = vi.fn()
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory: mockClientFactory},
    })
    const initialState = authStore.getInitialState(instance)
    initialState.authState = {
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    } as AuthState
    const state = createStoreState(initialState)
    const subscription = refreshStampedToken({state, instance})
    subscriptions.push(subscription)

    // Wait briefly
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Check nothing happened
    expect(mockClientFactory).not.toHaveBeenCalled()
    expect(navigator.locks.request).not.toHaveBeenCalled()
    expect(state.get().authState).toEqual({
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    })
  })

  it('does nothing if token is not stamped', async () => {
    const mockClient = {observable: {request: vi.fn(() => of({token: 'sk-nonstamped-token2'}))}}
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory: mockClientFactory},
    })
    const initialState = authStore.getInitialState(instance)
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'sk-nonstamped-token2',
      currentUser: null,
    }
    const state = createStoreState(initialState)
    const subscription = refreshStampedToken({state, instance})
    subscriptions.push(subscription)

    // Wait briefly
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Check nothing happened
    expect(mockClient.observable.request).not.toHaveBeenCalled()
    expect(navigator.locks.request).not.toHaveBeenCalled()
    expect(state.get().authState).toEqual({
      type: AuthStateType.LOGGED_IN,
      token: 'sk-nonstamped-token2',
      currentUser: null,
    })
  })
})
