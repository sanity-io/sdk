import {describe, expect, it, vi} from 'vitest'
import {getClientStore} from './clientStore'
import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {getAuthStore} from '../../auth/getAuthStore'

// Mock at module level but don't provide implementation yet
vi.mock('../../auth/getAuthStore')

describe('clientStore', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    // Reset to default mock implementation
    vi.mocked(getAuthStore).mockImplementation(() => ({
      // @ts-expect-error
      subscribe: () => () => {}, // Default no-op implementation
    }))
  })

  it('creates a store with the expected interface', () => {
    const sanityInstance = createSanityInstance(config)
    const store = getClientStore(sanityInstance)
    expect(store).toHaveProperty('getClientEvents')
    expect(store).toHaveProperty('getOrCreateClient')
    expect(store).toHaveProperty('receiveToken')
  })

  it('provides clients with correct configuration', () => {
    const sanityInstance = createSanityInstance(config)
    const store = getClientStore(sanityInstance)
    const client = store.getOrCreateClient({apiVersion: 'v2024-11-12'})
    const clientConfig = client.config()
    expect(clientConfig).toMatchObject({
      ...config,
      useCdn: false,
    })
  })

  it('creates clients with config auth token', () => {
    const instanceWithToken = createSanityInstance({
      ...config,
      auth: {
        token: 'initial-auth-token',
      },
    })

    const store = getClientStore(instanceWithToken)
    const client = store.getOrCreateClient({apiVersion: 'v2024-11-12'})

    expect(client.config().token).toBe('initial-auth-token')
  })

  it('handles logged-in auth state changes', async () => {
    const sanityInstance = createSanityInstance(config)

    // Override mock implementation just for this test
    vi.mocked(getAuthStore).mockImplementation(() => ({
      // @ts-expect-error
      subscribe: (observer: any) => {
        observer.next({
          type: 'logged-in',
          token: 'test-token',
        })
        return () => {} // Cleanup function
      },
    }))

    const store = getClientStore(sanityInstance)

    // Wait for async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Verify the token was received
    const client = store.getOrCreateClient({apiVersion: 'v2023-01-01'})
    expect(client.config().token).toBe('test-token')
  })
})
