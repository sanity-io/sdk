import {createSanityInstance} from '../../../instance/sanityInstance'
import {config} from '../../../../test/fixtures'
import {getClientStore} from '../clientStore'

describe('receiveToken', () => {
  const sanityInstance = createSanityInstance(config)
  it('updates client tokens when auth state changes', () => {
    const store = getClientStore(sanityInstance)

    const client = store.getOrCreateClient({apiVersion: 'v2023-01-01'})
    expect(client.config().token).toBeUndefined()

    store.receiveToken('new-token')

    const updatedClient = store.getOrCreateClient({apiVersion: 'v2023-01-01'})
    expect(updatedClient.config().token).toBe('new-token')
  })
})
