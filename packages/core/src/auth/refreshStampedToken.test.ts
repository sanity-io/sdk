import {of, Subscription, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {createStoreState} from '../store/createStoreState'
import {AuthStateType} from './authStateType'
import {type AuthState, authStore} from './authStore'
import {refreshStampedToken} from './refreshStampedToken'
import {createLoggedInAuthState} from './utils'

// Mock logger to prevent actual logging during tests
vi.mock('../utils/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/logger')>()
  return {
    ...original,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    })),
  }
})

describe('refreshStampedToken', () => {
  let mockStorage: Storage
  let originalDocument: Document
  let subscriptions: Subscription[]

  beforeEach(() => {
    subscriptions = []
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Mock document for visibility API
    originalDocument = global.document
    Object.defineProperty(global, 'document', {
      value: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    })

    mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    }
  })

  afterEach(async () => {
    subscriptions.forEach((sub) => sub.unsubscribe())
    // Restore original document
    Object.defineProperty(global, 'document', {
      value: originalDocument,
      writable: true,
    })
    // Restore real timers
    try {
      await vi.runAllTimersAsync() // Attempt to flush cleanly
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Ignoring timer error during afterEach cleanup:', e)
    }
    vi.useRealTimers()
  })

  it('refreshes the token when the interval timer fires', async () => {
    const mockClient = {
      observable: {request: vi.fn(() => of({token: 'sk-refreshed-token-st123'}))},
    }
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'sk-initial-token-st123',
      currentUser: null,
    }
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    await vi.advanceTimersToNextTimerAsync()

    const finalAuthState = state.get().authState
    expect(finalAuthState.type).toBe(AuthStateType.LOGGED_IN)
    if (finalAuthState.type === AuthStateType.LOGGED_IN) {
      expect(finalAuthState.token).toBe('sk-refreshed-token-st123')
    }
  })

  it('writes the refreshed token to storage', async () => {
    const mockClient = {
      observable: {request: vi.fn(() => of({token: 'sk-refreshed-token-st123'}))},
    }
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'sk-initial-token-st123',
      currentUser: null,
    }
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    await vi.advanceTimersToNextTimerAsync()

    expect(mockClient.observable.request).toHaveBeenCalled()
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      initialState.options.storageKey,
      JSON.stringify({token: 'sk-refreshed-token-st123'}),
    )
  })

  it('does not refresh on visibility change when lastTokenRefresh is recent', async () => {
    const mockClient = {
      observable: {request: vi.fn(() => of({token: 'sk-refreshed-token-st123'}))},
    }
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    initialState.authState = createLoggedInAuthState('sk-initial-token-st123', null)
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    const addEventListenerMock = global.document.addEventListener as ReturnType<typeof vi.fn>
    expect(addEventListenerMock).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    const visibilityHandler = addEventListenerMock.mock.calls[0][1] as () => void

    Object.defineProperty(global.document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })

    visibilityHandler()
    await vi.advanceTimersByTimeAsync(100)

    expect(mockClient.observable.request).not.toHaveBeenCalled()
    const finalAuthState = state.get().authState
    if (finalAuthState.type === AuthStateType.LOGGED_IN) {
      expect(finalAuthState.token).toBe('sk-initial-token-st123')
    }
  })

  it('refreshes on visibility change when lastTokenRefresh is stale', async () => {
    const REFRESH_INTERVAL = 12 * 60 * 60 * 1000
    const mockClient = {
      observable: {request: vi.fn(() => of({token: 'sk-refreshed-token-st123'}))},
    }
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    const staleTimestamp = Date.now() - REFRESH_INTERVAL - 1000
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'sk-initial-token-st123',
      currentUser: null,
      lastTokenRefresh: staleTimestamp,
    }
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    const addEventListenerMock = global.document.addEventListener as ReturnType<typeof vi.fn>
    expect(addEventListenerMock).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    const visibilityHandler = addEventListenerMock.mock.calls[0][1] as () => void

    Object.defineProperty(global.document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })

    visibilityHandler()
    await vi.advanceTimersToNextTimerAsync()

    expect(mockClient.observable.request).toHaveBeenCalled()
    const finalAuthState = state.get().authState
    if (finalAuthState.type === AuthStateType.LOGGED_IN) {
      expect(finalAuthState.token).toBe('sk-refreshed-token-st123')
      expect(finalAuthState.lastTokenRefresh).toBeGreaterThan(staleTimestamp)
    }
  })

  it('refreshes on visibility change when lastTokenRefresh is undefined (pre-fix behavior)', async () => {
    const mockClient = {
      observable: {request: vi.fn(() => of({token: 'sk-refreshed-token-st123'}))},
    }
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'sk-initial-token-st123',
      currentUser: null,
      // lastTokenRefresh intentionally omitted to demonstrate the old bug
    }
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    const addEventListenerMock = global.document.addEventListener as ReturnType<typeof vi.fn>
    const visibilityHandler = addEventListenerMock.mock.calls[0][1] as () => void

    Object.defineProperty(global.document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })

    visibilityHandler()
    await vi.advanceTimersToNextTimerAsync()

    // Without lastTokenRefresh, shouldRefreshToken returns true — this is the bug
    expect(mockClient.observable.request).toHaveBeenCalled()
  })

  it('does not refresh when tab is not visible', async () => {
    // Set visibility to hidden
    Object.defineProperty(global, 'document', {
      value: {
        visibilityState: 'hidden',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    })

    const mockClient = {
      observable: {request: vi.fn(() => of({token: 'sk-refreshed-token-st123'}))},
    }
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'sk-initial-token-st123',
      currentUser: null,
    }
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    await vi.advanceTimersToNextTimerAsync()

    // Verify that no refresh occurred
    expect(mockClient.observable.request).not.toHaveBeenCalled()
    const finalAuthState = state.get().authState
    if (finalAuthState.type === AuthStateType.LOGGED_IN) {
      expect(finalAuthState.token).toBe('sk-initial-token-st123')
    }
  })

  it('sets an error state when token refresh fails', async () => {
    const error = new Error('Refresh failed')
    const mockClient = {observable: {request: vi.fn(() => throwError(() => error))}}
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'sk-initial-token-st123',
      currentUser: null,
    }
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    await vi.advanceTimersToNextTimerAsync()

    const finalAuthStateError = state.get().authState
    expect(finalAuthStateError.type).toBe(AuthStateType.ERROR)
    // Add type guard before accessing error property
    if (finalAuthStateError.type === AuthStateType.ERROR) {
      expect(finalAuthStateError.error).toBe(error)
    }
  })

  it('does nothing if user is not logged in', async () => {
    const mockClientFactory = vi.fn()
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    initialState.authState = {
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    } as AuthState
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    await vi.advanceTimersByTimeAsync(0)

    expect(mockClientFactory).not.toHaveBeenCalled()
    expect(state.get().authState.type).toBe(AuthStateType.LOGGED_OUT)
  })

  it('does nothing if token is not stamped', async () => {
    const mockClient = {observable: {request: vi.fn()}}
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory: mockClientFactory, storageArea: mockStorage},
    })
    const initialState = authStore.getInitialState(instance, null)
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'sk-nonstamped-token',
      currentUser: null,
    }
    const state = createStoreState(initialState)

    const subscription = refreshStampedToken({state, instance, key: null})
    subscriptions.push(subscription)

    await vi.advanceTimersByTimeAsync(0)

    expect(mockClient.observable.request).not.toHaveBeenCalled()
    // Add type guard before accessing token property
    const finalAuthState = state.get().authState
    expect(finalAuthState.type).toBe(AuthStateType.LOGGED_IN)
    if (finalAuthState.type === AuthStateType.LOGGED_IN) {
      expect(finalAuthState.token).toBe('sk-nonstamped-token')
    }
  })
})
