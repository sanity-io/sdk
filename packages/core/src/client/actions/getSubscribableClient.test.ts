import {type SanityClient} from '@sanity/client'
import {firstValueFrom, Observable} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {getAuthStore} from '../../auth/authStore'
import {createSanityInstance} from '../../instance/sanityInstance'
import type {SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {clientStore} from '../clientStore'
import {getSubscribableClient} from './getSubscribableClient'

type TokenState = ReturnType<typeof getAuthStore>['tokenState']

vi.mock('../../auth/authStore', () => ({
  getAuthStore: vi.fn().mockReturnValue({
    tokenState: {
      subscribe: vi.fn().mockReturnValue(
        // unsubscribe function
        vi.fn(),
      ),
      getState: vi.fn(),
    },
  }),
}))

describe('getSubscribableClient', () => {
  const apiVersion = '2024-12-05'

  let instance: SanityInstance
  let getTokenState: Mock<TokenState['getState']>
  let tokenSubscribe: Mock<TokenState['subscribe']>
  let tokenSubscriber: Mock<Parameters<TokenState['subscribe']>[0]>

  beforeEach(() => {
    instance = createSanityInstance(config)

    // @ts-expect-error no params required since mocking
    const {tokenState} = getAuthStore()
    getTokenState = vi.mocked(tokenState.getState)
    tokenSubscribe = vi.mocked(tokenState.subscribe)

    vi.clearAllMocks()

    // ensure resource is created
    getOrCreateResource(instance, clientStore)

    expect(tokenSubscribe).toHaveBeenCalledTimes(1)
    tokenSubscriber = vi.mocked(tokenSubscribe.mock.calls[0][0])
  })

  it('should create subscribable client and emit initial client', () => {
    const client$ = getSubscribableClient(instance, {apiVersion})

    client$.subscribe({
      next: (emittedClient) => {
        expect(emittedClient.config().apiVersion).toBe(apiVersion)
      },
    })
  })

  it('should emit updated client when auth token changes', () => {
    const emittedClients: SanityClient[] = []

    const client$ = getSubscribableClient(instance, {apiVersion})

    // Track emissions
    client$.subscribe({
      next: (client) => {
        emittedClients.push(client)
      },
    })

    getTokenState.mockReturnValue('new-token')
    tokenSubscriber(getTokenState(), null)

    // initial client + updated client = 2
    expect(emittedClients.length).toBe(2)
    expect(emittedClients[0].config().token).toBeUndefined()
    expect(emittedClients[1].config().token).toBe('new-token')
  })

  it('should use the same client for same API version', async () => {
    const client1Promise = firstValueFrom(
      new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion}).subscribe(observer),
      ),
    )
    const client2Promise = firstValueFrom(
      new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion}).subscribe(observer),
      ),
    )

    const client1 = await client1Promise
    const client2 = await client2Promise

    expect(client1).toBe(client2)
  })
})
