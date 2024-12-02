import {describe, test, expect} from 'vitest'
import {createSessionStore, LOGGED_IN_STATES} from './sessionStore'
import type {CurrentUser} from '@sanity/types'

describe('sessionStore', () => {
  test('creates store with initial state', () => {
    const store = createSessionStore()
    const state = store.getState()

    expect(state.sessionId).toBeNull()
    expect(state.user).toBeNull()
    expect(state.loggedInState).toBe(LOGGED_IN_STATES.LOGGED_OUT)
  })

  test('setSessionId updates session ID', () => {
    const store = createSessionStore()
    const testSessionId = 'test-session-123'

    store.getState().setSessionId(testSessionId)
    expect(store.getState().sessionId).toBe(testSessionId)

    // Test clearing session ID
    store.getState().setSessionId(null)
    expect(store.getState().sessionId).toBeNull()
  })

  test('setUser updates user information', () => {
    const store = createSessionStore()
    const testUser: CurrentUser = {
      id: 'user123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'administrator',
      roles: [{name: 'administrator', title: 'Administrator'}],
    }

    store.getState().setUser(testUser)
    expect(store.getState().user).toEqual(testUser)

    // Test clearing user
    store.getState().setUser(null)
    expect(store.getState().user).toBeNull()
  })

  test('setLoggedInState updates login state', () => {
    const store = createSessionStore()

    // Test all possible login states
    store.getState().setLoggedInState(LOGGED_IN_STATES.LOADING)
    expect(store.getState().loggedInState).toBe(LOGGED_IN_STATES.LOADING)

    store.getState().setLoggedInState(LOGGED_IN_STATES.LOGGED_IN)
    expect(store.getState().loggedInState).toBe(LOGGED_IN_STATES.LOGGED_IN)

    store.getState().setLoggedInState(LOGGED_IN_STATES.UNAUTHORIZED)
    expect(store.getState().loggedInState).toBe(LOGGED_IN_STATES.UNAUTHORIZED)

    store.getState().setLoggedInState(LOGGED_IN_STATES.LOGGED_OUT)
    expect(store.getState().loggedInState).toBe(LOGGED_IN_STATES.LOGGED_OUT)
  })
})
