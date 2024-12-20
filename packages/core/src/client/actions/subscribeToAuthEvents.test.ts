import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {getAuthStore} from '../../auth/authStore'
import {createSanityInstance} from '../../instance/sanityInstance'
import type {SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {clientStore} from '../clientStore'
import {getClient} from './getClient'

type TokenState = ReturnType<typeof getAuthStore>['tokenState']

vi.mock('../../auth/authStore', () => ({
  getAuthStore: vi.fn().mockReturnValue({
    tokenState: {
      getState: vi.fn(),
      subscribe: vi.fn().mockReturnValue(
        // unsubscribe function
        vi.fn(),
      ),
    },
  }),
}))

describe('subscribeToAuthEvents', () => {
  const apiVersion = '2024-01-01'
  const apiVersion2 = '2024-02-01'

  let instance: SanityInstance
  let getTokenState: Mock<TokenState['getState']>
  let tokenSubscribe: Mock<TokenState['subscribe']>
  let tokenUnsubscribe: Mock<ReturnType<TokenState['subscribe']>>

  beforeEach(() => {
    instance = createSanityInstance(config)

    // @ts-expect-error no params required since mocking
    const {tokenState} = getAuthStore()
    getTokenState = vi.mocked(tokenState.getState)
    tokenSubscribe = vi.mocked(tokenState.subscribe)
    tokenUnsubscribe = vi.mocked(tokenSubscribe(() => {}))

    vi.clearAllMocks()

    // ensure state is initialized for this resource
    getOrCreateResource(instance, clientStore)
  })

  it('updates all clients in the store when token changes', () => {
    const client1 = getClient(instance, {apiVersion})
    const client2 = getClient(instance, {apiVersion: apiVersion2})

    expect(client1.config().token).toBeUndefined()
    expect(client2.config().token).toBeUndefined()

    getTokenState.mockReturnValue('new-token')
    expect(tokenSubscribe).toHaveBeenCalledTimes(1)
    const [subscriber] = tokenSubscribe.mock.calls[0]
    subscriber(getTokenState(), null)

    // Verify all clients were updated
    const updatedClient1 = getClient(instance, {apiVersion})
    const updatedClient2 = getClient(instance, {apiVersion: apiVersion2})

    expect(updatedClient1.config().token).toBe('new-token')
    expect(updatedClient2.config().token).toBe('new-token')
  })

  it('clears the token when token is null', () => {
    getTokenState.mockReturnValue('old-token')
    expect(tokenSubscribe).toHaveBeenCalledTimes(1)
    const [subscriber] = tokenSubscribe.mock.calls[0]
    subscriber(getTokenState(), null)

    // Verify all clients were updated
    const client1 = getClient(instance, {apiVersion})
    const client2 = getClient(instance, {apiVersion: apiVersion2})

    expect(client1.config().token).toBe('old-token')
    expect(client2.config().token).toBe('old-token')

    getTokenState.mockReturnValue(null)
    expect(tokenSubscribe).toHaveBeenCalledTimes(1)
    subscriber(getTokenState(), 'old-token')

    // Verify all clients were updated
    const clearedClient1 = getClient(instance, {apiVersion})
    const clearedClient2 = getClient(instance, {apiVersion: apiVersion2})

    expect(clearedClient1.config().token).toBeUndefined()
    expect(clearedClient2.config().token).toBeUndefined()
  })

  it('should properly clean up subscription when disposed', () => {
    expect(tokenSubscribe).toHaveBeenCalledTimes(1)
    expect(tokenUnsubscribe).not.toHaveBeenCalled()

    instance.dispose()

    expect(tokenUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
