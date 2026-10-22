import {ClientError} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {defer, delay, of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_COUNT,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
} from '../document/documentConstants'
import {createSanityInstance} from '../store/createSanityInstance'
import {createStoreState} from '../store/createStoreState'
import {AuthStateType} from './authStateType'
import {authStore} from './authStore'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'

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

const clientError = (statusCode: number) => new ClientError({statusCode, headers: {}, body: {}})

describe('subscribeToStateAndFetchCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the current user if the is logged in without a current user present', () => {
    const mockUser = {id: 'example-user', email: 'user@example.com'} as CurrentUser
    const mockRequest = vi.fn().mockReturnValue(of(mockUser))
    const mockClient = {observable: {request: mockRequest}}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})

    const state = createStoreState(authStore.getInitialState(instance, null))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance, key: null})

    expect(state.get()).toMatchObject({authState: {type: AuthStateType.LOGGED_OUT}})

    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: null},
    })

    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: mockUser},
    })
    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      ignoreBrowserTokenWarning: true,
      requestTagPrefix: 'sanity.sdk.auth',
      token: 'new-token',
      useProjectHostname: false,
      useCdn: false,
    })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/users/me',
      tag: 'users.get-current',
    })

    subscription.unsubscribe()
  })

  it("doesn't set the current user if the state is not logged in", () => {
    const mockUser = {id: 'example-user'} as CurrentUser
    const mockRequest = vi.fn().mockReturnValue(of(mockUser).pipe(delay(0)))
    const mockClient = {observable: {request: mockRequest}}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})

    const state = createStoreState(authStore.getInitialState(instance, null))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance, key: null})

    expect(state.get()).toMatchObject({authState: {type: AuthStateType.LOGGED_OUT}})

    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: null},
    })
    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    })

    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_OUT},
    })

    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      ignoreBrowserTokenWarning: true,
      requestTagPrefix: 'sanity.sdk.auth',
      token: 'new-token',
      useProjectHostname: false,
      useCdn: false,
    })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/users/me',
      tag: 'users.get-current',
    })

    subscription.unsubscribe()
  })

  it('sets an auth error right away when the request is rejected', () => {
    const error = clientError(401)
    const mockRequest = vi.fn().mockReturnValue(throwError(() => error))
    const mockClient = {observable: {request: mockRequest}}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})

    const state = createStoreState(authStore.getInitialState(instance, null))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance, key: null})

    expect(state.get()).toMatchObject({authState: {type: AuthStateType.LOGGED_OUT}})

    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: null},
    })

    expect(state.get()).toMatchObject({authState: {type: AuthStateType.ERROR, error}})

    expect(clientFactory).toHaveBeenCalled()
    expect(mockRequest).toHaveBeenCalled()

    subscription.unsubscribe()
  })

  it('recovers from a fetch error when a new token is set', () => {
    const error = clientError(401)
    const mockUser = {id: 'recovered-user'} as CurrentUser
    const mockRequest = vi
      .fn()
      .mockReturnValueOnce(throwError(() => error))
      .mockReturnValueOnce(of(mockUser))
    const mockClient = {observable: {request: mockRequest}}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})

    const state = createStoreState(authStore.getInitialState(instance, null))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance, key: null})

    // First token causes a 401 — state should transition to ERROR
    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'expired-token', currentUser: null},
    })
    expect(state.get()).toMatchObject({authState: {type: AuthStateType.ERROR, error}})

    // Simulate comlink providing a fresh token (setAuthToken sets LOGGED_IN with new token)
    state.set('setNewToken', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'fresh-token', currentUser: null},
    })

    // Subscription should still be alive — re-fetches /users/me with the new token
    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_IN, token: 'fresh-token', currentUser: mockUser},
    })
    expect(mockRequest).toHaveBeenCalledTimes(2)

    subscription.unsubscribe()
  })

  it('recovers from multiple consecutive fetch errors', () => {
    const error1 = clientError(401)
    const error2 = clientError(403)
    const mockUser = {id: 'finally-recovered'} as CurrentUser
    const mockRequest = vi
      .fn()
      .mockReturnValueOnce(throwError(() => error1))
      .mockReturnValueOnce(throwError(() => error2))
      .mockReturnValueOnce(of(mockUser))
    const mockClient = {observable: {request: mockRequest}}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})

    const state = createStoreState(authStore.getInitialState(instance, null))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance, key: null})

    // First attempt fails
    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'token-1', currentUser: null},
    })
    expect(state.get()).toMatchObject({authState: {type: AuthStateType.ERROR, error: error1}})

    // Second attempt also fails
    state.set('setNewToken', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'token-2', currentUser: null},
    })
    expect(state.get()).toMatchObject({authState: {type: AuthStateType.ERROR, error: error2}})

    // Third attempt succeeds
    state.set('setNewToken', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'token-3', currentUser: null},
    })
    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_IN, token: 'token-3', currentUser: mockUser},
    })
    expect(mockRequest).toHaveBeenCalledTimes(3)

    subscription.unsubscribe()
  })

  it('does not re-fetch with the same token but recovers with a different token', () => {
    const error = clientError(401)
    const mockUser = {id: 'recovered-user'} as CurrentUser
    const mockRequest = vi
      .fn()
      .mockReturnValueOnce(throwError(() => error))
      .mockReturnValueOnce(of(mockUser))
    const mockClient = {observable: {request: mockRequest}}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})

    const state = createStoreState(authStore.getInitialState(instance, null))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance, key: null})

    // First attempt fails
    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'same-token', currentUser: null},
    })
    expect(state.get()).toMatchObject({authState: {type: AuthStateType.ERROR, error}})

    // Same token should be blocked by distinctUntilChanged — no re-fetch
    state.set('setNewToken', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'same-token', currentUser: null},
    })
    expect(mockRequest).toHaveBeenCalledTimes(1)

    // A different token should pass distinctUntilChanged and trigger recovery
    state.set('setNewToken', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'different-token', currentUser: null},
    })
    expect(state.get()).toMatchObject({
      authState: {
        type: AuthStateType.LOGGED_IN,
        token: 'different-token',
        currentUser: mockUser,
      },
    })
    expect(mockRequest).toHaveBeenCalledTimes(2)

    subscription.unsubscribe()
  })

  describe('with transient failures', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    function startFetch(failures: unknown[]) {
      const mockUser = {id: 'example-user'} as CurrentUser
      let attempts = 0
      const request$ = defer(() => {
        const failure = failures[attempts++]

        return failure ? throwError(() => failure) : of(mockUser)
      })
      const clientFactory = vi.fn().mockReturnValue({observable: {request: () => request$}})
      const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})
      const state = createStoreState(authStore.getInitialState(instance, null))
      const subscription = subscribeToStateAndFetchCurrentUser({state, instance, key: null})

      state.set('setLoggedIn', {
        authState: {type: AuthStateType.LOGGED_IN, token: 'token', currentUser: null},
      })

      return {state, subscription, mockUser, attempts: () => attempts}
    }

    it('stays logged in while it retries and then sets the current user', () => {
      const {state, subscription, mockUser, attempts} = startFetch([clientError(503)])

      expect(state.get()).toMatchObject({
        authState: {type: AuthStateType.LOGGED_IN, currentUser: null},
      })

      vi.advanceTimersByTime(OUT_OF_SYNC_RETRY_BASE_DELAY)

      expect(state.get()).toMatchObject({
        authState: {type: AuthStateType.LOGGED_IN, currentUser: mockUser},
      })
      expect(attempts()).toBe(2)

      subscription.unsubscribe()
    })

    it('stops retrying when the user logs out', () => {
      const {state, subscription, attempts} = startFetch(
        Array(OUT_OF_SYNC_RETRY_COUNT + 1).fill(clientError(500)),
      )

      state.set('logout', {authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false}})
      vi.advanceTimersByTime(OUT_OF_SYNC_RETRY_COUNT * OUT_OF_SYNC_RETRY_MAX_DELAY)

      expect(state.get()).toMatchObject({authState: {type: AuthStateType.LOGGED_OUT}})
      expect(attempts()).toBe(1)

      subscription.unsubscribe()
    })

    it('fetches again when the user logs back in with the same token', () => {
      const {state, subscription, mockUser, attempts} = startFetch([clientError(503)])

      state.set('logout', {authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false}})
      vi.advanceTimersByTime(OUT_OF_SYNC_RETRY_MAX_DELAY)
      state.set('setLoggedIn', {
        authState: {type: AuthStateType.LOGGED_IN, token: 'token', currentUser: null},
      })

      expect(state.get()).toMatchObject({
        authState: {type: AuthStateType.LOGGED_IN, currentUser: mockUser},
      })
      expect(attempts()).toBe(2)

      subscription.unsubscribe()
    })

    it('drops a pending retry when the token changes', () => {
      const {state, subscription, mockUser, attempts} = startFetch([
        clientError(503),
        clientError(503),
      ])

      state.set('setNewToken', {
        authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: null},
      })
      vi.advanceTimersByTime(OUT_OF_SYNC_RETRY_BASE_DELAY)

      expect(state.get()).toMatchObject({
        authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: mockUser},
      })
      expect(attempts()).toBe(3)

      subscription.unsubscribe()
    })

    it('sets an auth error once the retries run out', () => {
      const error = clientError(500)
      const {state, subscription, attempts} = startFetch(
        Array(OUT_OF_SYNC_RETRY_COUNT + 1).fill(error),
      )

      vi.advanceTimersByTime(OUT_OF_SYNC_RETRY_COUNT * OUT_OF_SYNC_RETRY_MAX_DELAY)

      expect(state.get()).toMatchObject({authState: {type: AuthStateType.ERROR, error}})
      expect(attempts()).toBe(OUT_OF_SYNC_RETRY_COUNT + 1)

      subscription.unsubscribe()
    })
  })
})
