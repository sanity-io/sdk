import {type Subscription} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {type AuthState} from '../../auth/authStore'
import {createSanityInstance} from '../../instance/sanityInstance'
import {getClient} from './getClient'

describe('subscribeToAuthEvents', () => {
  const instance = createSanityInstance(config)
  let subscription: Subscription | undefined
  let authStateCallback: ((state: AuthState) => void) | undefined

  // Mock the auth store subscription
  vi.mock('../../auth/getAuthStore', () => ({
    getAuthStore: vi.fn(() => ({
      subscribe: (callback: (state: AuthState) => void) => {
        authStateCallback = callback
        return () => {
          // Cleanup function
          authStateCallback = undefined
        }
      },
    })),
  }))

  beforeEach(() => {
    authStateCallback = undefined
    vi.clearAllMocks()
  })

  afterEach(() => {
    subscription?.unsubscribe()
  })

  describe('subscribeToAuthEvents', () => {
    const instance = createSanityInstance(config)
    let subscription: Subscription | undefined
    let authStateCallback: ((state: AuthState) => void) | undefined

    // Mock the auth store subscription
    vi.mock('../../auth/getAuthStore', () => ({
      getAuthStore: vi.fn(() => ({
        subscribe: (callback: (state: AuthState) => void) => {
          authStateCallback = callback
          return () => {
            // Cleanup function
            authStateCallback = undefined
          }
        },
      })),
    }))

    beforeEach(() => {
      authStateCallback = undefined
      vi.clearAllMocks()
    })

    afterEach(() => {
      subscription?.unsubscribe()
    })

    it('updates all clients in the store when token changes', () => {
      // Get the real client store
      const client1 = getClient(instance, {apiVersion: 'v2024-01-01'})
      const client2 = getClient(instance, {apiVersion: 'v2024-02-01'})

      expect(client1.config().token).toBeUndefined()
      expect(client2.config().token).toBeUndefined()

      // Don't create a new subscription since clientStore already created one in initialize
      // Just simulate the auth state change
      authStateCallback?.({
        type: 'logged-in',
        token: 'new-token',
        currentUser: null,
      })

      // Verify all clients were updated
      const updatedClient1 = getClient(instance, {apiVersion: 'v2024-01-01'})
      const updatedClient2 = getClient(instance, {apiVersion: 'v2024-02-01'})

      expect(updatedClient1.config().token).toBe('new-token')
      expect(updatedClient2.config().token).toBe('new-token')
    })
  })
})
