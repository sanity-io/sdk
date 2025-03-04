import {of, Subscription, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {AuthStateType} from './authStateType'
import {type AuthState, authStore} from './authStore'
import {refreshStampedToken} from './refreshStampedToken'

describe('refreshStampedToken', () => {
  beforeEach(() => {
    // Clear mocks between tests
    vi.clearAllMocks()
    // Use fake timers so we can simulate interval triggers instantly
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Restore real timers
    vi.useRealTimers()
  })

  it('refreshes the token on interval (success scenario)', () => {
    // Mock client so that .request(...) yields a new token
    const mockClient = {
      observable: {
        request: vi.fn(() => of({token: 'refreshed-token'})),
      },
    }
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)

    // Create an instance (similar to how you do in subscribeToStateAndFetchCurrentUser.test.ts)
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
      auth: {clientFactory: mockClientFactory},
    })

    // Create the initial state: logged in with some initial token
    const initialState = authStore.getInitialState(instance)
    // Force it to be logged in from the start
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'initial-token',
      currentUser: null,
    }

    // Create the resource state
    const state = createResourceState(initialState)

    // Call refreshStampedToken ONCE
    // Because TParams is [], createInternalAction will call the inner function for us
    const subscription: Subscription = refreshStampedToken({state, instance})

    // Advance time by 10 minutes so the interval fires
    vi.advanceTimersByTime(10 * 60 * 1000)

    // The client request should have been called once
    expect(mockClient.observable.request).toHaveBeenCalledTimes(1)
    // The token in state should now be 'refreshed-token'
    expect(state.get().authState).toEqual({
      type: AuthStateType.LOGGED_IN,
      token: 'refreshed-token',
      currentUser: null,
    })

    // Cleanup
    subscription.unsubscribe()
  })

  it('sets an error state when token refresh fails', () => {
    const error = new Error('Refresh failed')
    const mockClient = {
      observable: {
        request: vi.fn(() => throwError(() => error)),
      },
    }
    const mockClientFactory = vi.fn().mockReturnValue(mockClient)
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
      auth: {clientFactory: mockClientFactory},
    })

    // Start logged-in
    const initialState = authStore.getInitialState(instance)
    initialState.authState = {
      type: AuthStateType.LOGGED_IN,
      token: 'initial-token',
      currentUser: null,
    }
    const state = createResourceState(initialState)

    const subscription: Subscription = refreshStampedToken({state, instance})

    // Move time forward to trigger the interval
    vi.advanceTimersByTime(10 * 60 * 1000)

    // Should have set an error state
    expect(state.get().authState).toEqual({
      type: AuthStateType.ERROR,
      error,
    })

    subscription.unsubscribe()
  })

  it('does nothing if user is not logged in', () => {
    const mockClientFactory = vi.fn()
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
      auth: {clientFactory: mockClientFactory},
    })

    // Start logged out
    const initialState = authStore.getInitialState(instance)
    initialState.authState = {
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    } as AuthState
    const state = createResourceState(initialState)

    const subscription: Subscription = refreshStampedToken({state, instance})

    // Move time forward
    vi.advanceTimersByTime(10 * 60 * 1000)

    // No calls, no changes
    expect(mockClientFactory).not.toHaveBeenCalled()
    expect(state.get().authState).toEqual({
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    })

    subscription.unsubscribe()
  })
})
