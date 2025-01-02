import type {CurrentUser} from '@sanity/types'
import {delay, of, throwError} from 'rxjs'
import {beforeEach, describe, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {AuthStateType, authStore} from './authStore'
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

    const state = createResourceState(authStore.getInitialState(instance))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance})

    expect(state.get()).toMatchObject({authState: {type: AuthStateType.LOGGED_OUT}})

    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: null},
    })

    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: mockUser},
    })
    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      dataset: 'd',
      ignoreBrowserTokenWarning: true,
      projectId: 'p',
      requestTagPrefix: 'sdk.auth',
      token: 'new-token',
      useProjectHostname: true,
    })
    expect(mockRequest).toHaveBeenCalledWith({method: 'GET', uri: '/users/me'})

    subscription.unsubscribe()
  })

  it("doesn't set the current user if the state is not logged in", () => {
    const mockUser = {id: 'example-user'} as CurrentUser
    const mockRequest = vi.fn().mockReturnValue(of(mockUser).pipe(delay(0)))
    const mockClient = {observable: {request: mockRequest}}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})

    const state = createResourceState(authStore.getInitialState(instance))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance})

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
      dataset: 'd',
      ignoreBrowserTokenWarning: true,
      projectId: 'p',
      requestTagPrefix: 'sdk.auth',
      token: 'new-token',
      useProjectHostname: true,
    })
    expect(mockRequest).toHaveBeenCalledWith({method: 'GET', uri: '/users/me'})

    subscription.unsubscribe()
  })

  it('sets an auth error if fetching the current user fails', () => {
    const error = new Error('test error')
    const mockRequest = vi.fn().mockReturnValue(throwError(() => error))
    const mockClient = {observable: {request: mockRequest}}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})

    const state = createResourceState(authStore.getInitialState(instance))
    const subscription = subscribeToStateAndFetchCurrentUser({state, instance})

    expect(state.get()).toMatchObject({authState: {type: AuthStateType.LOGGED_OUT}})

    state.set('setLoggedIn', {
      authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser: null},
    })

    expect(state.get()).toMatchObject({authState: {type: AuthStateType.ERROR, error}})

    expect(clientFactory).toHaveBeenCalled()
    expect(mockRequest).toHaveBeenCalled()

    subscription.unsubscribe()
  })
})
