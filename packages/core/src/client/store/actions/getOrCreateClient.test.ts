import {type SanityClient, createClient} from '@sanity/client'
import {createSanityInstance} from '../../../instance/sanityInstance'
import {createClientStore} from '../clientStore'
import {config} from '../../../../test/fixtures'

describe('getOrCreateClient', () => {
  const API_VERSION = '2024-12-05'
  let client: SanityClient
  let store: ReturnType<typeof createClientStore>
  let instance: ReturnType<typeof createSanityInstance>

  beforeEach(() => {
    instance = createSanityInstance(config)
    client = createClient({...config, apiVersion: API_VERSION, useCdn: false})
    store = createClientStore(instance, client)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('throws error when apiVersion is missing', () => {
    expect(() => store.getOrCreateClient({})).toThrow('Missing required `apiVersion` option')
  })

  it('creates new client when apiVersion is not found', () => {
    const withConfigSpy = vi.spyOn(client, 'withConfig')
    const apiVersion = '2024-01-01'

    const result = store.getOrCreateClient({apiVersion})

    expect(withConfigSpy).toHaveBeenCalledWith({apiVersion})
    expect(result.config().apiVersion).toBe(apiVersion)
  })

  it('reuses existing client for same apiVersion', () => {
    const withConfigSpy = vi.spyOn(client, 'withConfig')
    const newClientMock = {id: 'new-client'} as unknown as SanityClient
    withConfigSpy.mockReturnValue(newClientMock)

    const result1 = store.getOrCreateClient({apiVersion: '2024-01-01'})
    const result2 = store.getOrCreateClient({apiVersion: '2024-01-01'})

    expect(withConfigSpy).toHaveBeenCalledTimes(1)
    expect(result1).toBe(newClientMock)
    expect(result2).toBe(newClientMock)
  })

  it('creates different clients for different apiVersions', () => {
    const withConfigSpy = vi.spyOn(client, 'withConfig')
    const client1Mock = {id: 'client-1'} as unknown as SanityClient
    const client2Mock = {id: 'client-2'} as unknown as SanityClient
    withConfigSpy.mockReturnValueOnce(client1Mock).mockReturnValueOnce(client2Mock)

    const result1 = store.getOrCreateClient({apiVersion: '2024-01-01'})
    const result2 = store.getOrCreateClient({apiVersion: '2024-02-01'})

    expect(withConfigSpy).toHaveBeenCalledTimes(2)
    expect(result1).toBe(client1Mock)
    expect(result2).toBe(client2Mock)
    expect(result1).not.toBe(result2)
  })
})
