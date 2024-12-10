import {type SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'
import {getSubscribableClient} from './getSubscribableClient'
import {getClientStore} from './store/clientStore'
import {createSanityInstance} from '../instance/sanityInstance'
import {config} from '../../test/fixtures'

describe('getSubscribableClient', () => {
  const API_VERSION = '2024-12-05'
  const instance = createSanityInstance(config)
  const store = getClientStore(instance)

  it('should create subscribable client and emit initial client', () => {
    const options = {apiVersion: API_VERSION}

    const storeSpy = vi.spyOn(getClientStore(instance), 'getClientEvents')

    const client$ = getSubscribableClient(options, instance)

    client$.subscribe({
      next: (emittedClient) => {
        expect(storeSpy).toHaveBeenCalledWith(options)
        expect(emittedClient.config().apiVersion).toBe(API_VERSION)
      },
    })
  })

  it('should emit updated client when store changes', () => {
    const options = {apiVersion: API_VERSION}
    const client$ = getSubscribableClient(options, instance)

    // Track emissions
    const emittedClients: SanityClient[] = []

    client$.subscribe({
      next: (client) => {
        emittedClients.push(client)

        if (emittedClients.length === 2) {
          expect(emittedClients[0].config().token).toBe(undefined)
          expect(emittedClients[1].config().token).toBe('new-token')
        }
      },
      complete: () => {},
    })

    // Simulate auth change using the curried action
    store.receiveToken('new-token')
  })

  it('should use the same client for same API version', async () => {
    const options = {apiVersion: API_VERSION}
    const client1$ = getSubscribableClient(options, instance)
    const client2$ = getSubscribableClient(options, instance)

    let firstClient: SanityClient | undefined

    client1$.subscribe({
      next: (client) => {
        firstClient = client

        client2$.subscribe({
          next: (secondClient) => {
            expect(secondClient).toBe(firstClient)
          },
        })
      },
    })
  })
})
