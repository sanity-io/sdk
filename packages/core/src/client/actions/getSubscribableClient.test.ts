import {type SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {getSubscribableClient} from './getSubscribableClient'

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

describe('getSubscribableClient', () => {
  const apiVersion = '2024-12-05'

  beforeEach(() => {
    tokenCallback = undefined
    vi.clearAllMocks()
  })

  it('should create subscribable client and emit initial client', () => {
    const instance = createSanityInstance(config)
    const client$ = getSubscribableClient(instance, {apiVersion})

    client$.subscribe({
      next: (emittedClient) => {
        expect(emittedClient.config().apiVersion).toBe(apiVersion)
      },
    })
  })

  it('should emit updated client when auth token changes', () => {
    const emittedClients: SanityClient[] = []

    const instance = createSanityInstance(config)
    const client$ = getSubscribableClient(instance, {apiVersion})

    // Track emissions
    client$.subscribe({
      next: (client) => {
        emittedClients.push(client)
      },
    })

    tokenCallback?.('new-token', null)

    // initial client + updated client = 2
    expect(emittedClients.length).toBe(2)
    expect(emittedClients[0].config().token).toBeUndefined()
    expect(emittedClients[1].config().token).toBe('new-token')
  })

  it('should use the same client for same API version', async () => {
    const instance = createSanityInstance(config)
    const client1$ = getSubscribableClient(instance, {apiVersion})
    const client2$ = getSubscribableClient(instance, {apiVersion})

    let firstClient: SanityClient | undefined

    await new Promise<void>((resolve) => {
      client1$.subscribe({
        next: (client) => {
          firstClient = client

          client2$.subscribe({
            next: (secondClient) => {
              expect(secondClient).toBe(firstClient)
              resolve()
            },
          })
        },
      })
    })
  })
})
