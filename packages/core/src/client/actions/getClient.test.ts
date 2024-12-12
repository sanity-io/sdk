import {createClient, type SanityClient} from '@sanity/client'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import {oldCreateClientStore} from '../clientStore'

describe('getOrCreateClient', () => {
  const API_VERSION = '2024-12-05'
  let defaultClient: SanityClient
  let store: ReturnType<typeof oldCreateClientStore>
  let instance: ReturnType<typeof createSanityInstance>

  beforeEach(() => {
    instance = createSanityInstance(config)
    defaultClient = createClient({...config, apiVersion: API_VERSION, useCdn: false})
    store = oldCreateClientStore(instance, defaultClient)
  })

  it('throws error when apiVersion is missing', () => {
    expect(() => store.getOrCreateClient({})).toThrow('Missing required `apiVersion` option')
  })

  it('creates new client with correct apiVersion', () => {
    const apiVersion = '2024-01-01'
    const result = store.getOrCreateClient({apiVersion})
    expect(result.config().apiVersion).toBe(apiVersion)
  })

  it('reuses existing client for same apiVersion', () => {
    const apiVersion = '2024-01-01'
    const result1 = store.getOrCreateClient({apiVersion})
    const result2 = store.getOrCreateClient({apiVersion})

    expect(result1).toBe(result2)
  })

  it('preserves client identity after token update', () => {
    const apiVersion = '2024-01-01'
    const client1 = store.getOrCreateClient({apiVersion})

    // Update token
    store.receiveToken('new-token')

    const client2 = store.getOrCreateClient({apiVersion})

    // Verify the new token was applied
    expect(client2.config().token).toBe('new-token')
    expect(client2.config().apiVersion).toBe(apiVersion)

    // Verify we got a new client instance (since token changed)
    expect(client2).not.toBe(client1)

    // Verify first client keeps its original config
    expect(client1.config().token).toBeUndefined()
  })
})
