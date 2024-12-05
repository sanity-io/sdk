import {describe, expect, it} from 'vitest'
import {getClientStore} from './clientStore'
import {config, sanityInstance} from '../../../test/fixtures'

describe('clientStore', () => {
  it('creates a store with the expected interface', () => {
    const store = getClientStore(sanityInstance)

    expect(store).toHaveProperty('getClientEvents')
    expect(store).toHaveProperty('getOrCreateClient')
    expect(store).toHaveProperty('receiveToken')
  })

  it('provides clients with correct configuration', () => {
    const store = getClientStore(sanityInstance)
    const client = store.getOrCreateClient({apiVersion: 'v2024-11-12'})

    // Verify the client has correct config
    const clientConfig = client.config()
    expect(clientConfig).toMatchObject({
      ...config,
      useCdn: false,
    })
  })

  it('updates client tokens when auth state changes', () => {
    const store = getClientStore(sanityInstance)

    const client = store.getOrCreateClient({apiVersion: 'v2023-01-01'})
    expect(client.config().token).toBeUndefined()

    store.receiveToken('new-token')

    const updatedClient = store.getOrCreateClient({apiVersion: 'v2023-01-01'})
    expect(updatedClient.config().token).toBe('new-token')
  })
})
