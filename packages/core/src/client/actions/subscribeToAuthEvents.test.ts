import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../../instance/sanityInstance'
import {config} from '../../../test/fixtures'
import {getClient} from './getClient'
import {subscribeToAuthEvents} from './subscribeToAuthEvents'

let tokenCallback: ((token: string | null, prevToken: string | null) => void) | undefined

vi.mock('../../auth/authStore', () => ({
  getAuthStore: vi.fn(() => {
    return {
      tokenState: {
        subscribe: vi.fn((callback) => {
          tokenCallback = callback
        }),
      },
    }
  }),
}))

describe('subscribeToAuthEvents', () => {
  const apiVersion = '2024-01-01'
  const apiVersion2 = '2024-02-01'
  beforeEach(() => {
    tokenCallback = undefined
    vi.clearAllMocks()
  })

  it('updates all clients in the store when token changes', () => {
    const instance = createSanityInstance(config)

    const client1 = getClient(instance, {apiVersion})
    const client2 = getClient(instance, {apiVersion: apiVersion2})

    expect(client1.config().token).toBeUndefined()
    expect(client2.config().token).toBeUndefined()

    tokenCallback?.('new-token', null)

    // Verify all clients were updated
    const updatedClient1 = getClient(instance, {apiVersion})
    const updatedClient2 = getClient(instance, {apiVersion: apiVersion2})

    expect(updatedClient1.config().token).toBe('new-token')
    expect(updatedClient2.config().token).toBe('new-token')
  })

  it('clears the token when token is null', () => {
    const instance = createSanityInstance({...config, auth: {token: 'old-token'}})

    // Verify all clients were updated
    const client1 = getClient(instance, {apiVersion})
    const client2 = getClient(instance, {apiVersion: apiVersion2})

    expect(client1.config().token).toBe('old-token')
    expect(client2.config().token).toBe('old-token')

    tokenCallback?.(null, 'old-token')

    // Verify all clients were updated
    const clearedClient1 = getClient(instance, {apiVersion})
    const clearedClient2 = getClient(instance, {apiVersion: apiVersion2})

    expect(clearedClient1.config().token).toBeUndefined()
    expect(clearedClient2.config().token).toBeUndefined()
  })

  it('should properly clean up subscription when unsubscribed', () => {
    const instance = createSanityInstance(config)
    const subscription = subscribeToAuthEvents(instance)

    subscription.unsubscribe()

    // because we're unsubscribed, this should not trigger any updates
    tokenCallback?.('another-token', null)
    const client = getClient(instance, {apiVersion})
    expect(client.config().token).toBeUndefined()
  })
})
