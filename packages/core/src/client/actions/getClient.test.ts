import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {getClient} from './getClient'

const instance = createSanityInstance(config)

describe('getOrCreateClient', () => {
  // it('throws error when apiVersion is missing', () => {
  //   expect(() => getClient(instance, {})).toThrow('Missing required `apiVersion` option')
  // })

  it('creates new client with correct apiVersion', () => {
    const apiVersion = '2024-01-01'
    const result = getClient(instance, {apiVersion})
    expect(result.config().apiVersion).toBe(apiVersion)
  })

  // it('reuses existing client for same apiVersion', () => {
  //   const apiVersion = '2024-01-01'
  //   const result1 = store.getOrCreateClient({apiVersion})
  //   const result2 = store.getOrCreateClient({apiVersion})

  //   expect(result1).toBe(result2)
  // })

  // it('preserves client identity after token update', () => {
  //   const apiVersion = '2024-01-01'
  //   const client1 = store.getOrCreateClient({apiVersion})

  //   // Update token
  //   store.receiveToken('new-token')

  //   const client2 = store.getOrCreateClient({apiVersion})

  //   // Verify the new token was applied
  //   expect(client2.config().token).toBe('new-token')
  //   expect(client2.config().apiVersion).toBe(apiVersion)

  //   // Verify we got a new client instance (since token changed)
  //   expect(client2).not.toBe(client1)

  //   // Verify first client keeps its original config
  //   expect(client1.config().token).toBeUndefined()
  // })
})
