import {type CurrentUser} from '@sanity/types'
import {delay, of, throwError} from 'rxjs'
import {beforeEach, describe, it} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {createStoreState} from '../store/createStoreState'
import {AuthStateType} from './authStateType'
import {authStore} from './authStore'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'

describe('subscribeToStateAndFetchCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the current user if the is logged in without a current user present', () => {
    const mockUser = {id: 'example-user'} as CurrentUser
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
      uri: '/users/me',
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
      uri: '/users/me',
      tag: 'users.get-current',
    })

    subscription.unsubscribe()
  })

  it('sets an auth error if fetching the current user fails', () => {
    const error = new Error('test error')
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
    const error = new Error('Unauthorized')
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
    const error1 = new Error('Unauthorized')
    const error2 = new Error('Unauthorized again')
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
    const error = new Error('Unauthorized')
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
})
