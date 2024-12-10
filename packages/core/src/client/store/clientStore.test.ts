import {describe, expect, it, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {getInternalAuthStore} from '../../auth/getInternalAuthStore'
import {createSanityInstance} from '../../instance/sanityInstance'
import {getClientStore} from './clientStore'

// Mock at module level but don't provide implementation yet
vi.mock('../../auth/getAuthStore')

describe.skip('clientStore', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    // Reset to default mock implementation
    vi.mocked(getInternalAuthStore).mockImplementation(() => ({
      setState: vi.fn(),
      getState: () => ({
        authState: {type: 'logged-out', isDestroyingSession: false},
        providers: undefined,
        setAuthState: vi.fn(),
        setProviders: vi.fn(),
        handleCallback: vi.fn(),
        getLoginUrls: vi.fn(),
        logout: vi.fn(),
        dispose: vi.fn(),
      }),
      getInitialState: () => ({
        authState: {type: 'logged-out', isDestroyingSession: false},
        providers: undefined,
        setAuthState: vi.fn(),
        setProviders: vi.fn(),
        handleCallback: vi.fn(),
        getLoginUrls: vi.fn(),
        logout: vi.fn(),
        dispose: vi.fn(),
      }),
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
    vi.mocked(getInternalAuthStore).mockImplementation(() => ({
      setState: vi.fn(),
      getState: () => ({
        authState: {type: 'logged-in', token: 'test-token', currentUser: null},
        providers: undefined,
        setAuthState: vi.fn(),
        setProviders: vi.fn(),
        handleCallback: vi.fn(),
        getLoginUrls: vi.fn(),
        logout: vi.fn(),
        dispose: vi.fn(),
      }),
      getInitialState: () => ({
        authState: {type: 'logged-in', token: 'test-token', currentUser: null},
        providers: undefined,
        setAuthState: vi.fn(),
        setProviders: vi.fn(),
        handleCallback: vi.fn(),
        getLoginUrls: vi.fn(),
        logout: vi.fn(),
        dispose: vi.fn(),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subscribe: (observer: any) => {
        observer.next({type: 'logged-in', token: 'test-token', currentUser: null})
        return () => {}
      },
    }))

    const store = getClientStore(sanityInstance)

    await new Promise((resolve) => setTimeout(resolve, 0))

    const client = store.getOrCreateClient({apiVersion: 'v2023-01-01'})
    expect(client.config().token).toBe('test-token')
  })

  it('properly cleans up auth subscription when cleanup is called', () => {
    const unsubscribeSpy = vi.fn()
    const sanityInstance = createSanityInstance(config)

    // Mock the auth store with a spy on the unsubscribe function
    vi.mocked(getInternalAuthStore).mockImplementation(() => ({
      setState: vi.fn(),
      getState: () => ({
        authState: {type: 'logged-in', token: 'test-token', currentUser: null},
        providers: undefined,
        setAuthState: vi.fn(),
        setProviders: vi.fn(),
        handleCallback: vi.fn(),
        getLoginUrls: vi.fn(),
        logout: vi.fn(),
        dispose: vi.fn(),
      }),
      getInitialState: () => ({
        authState: {type: 'logged-in', token: 'test-token', currentUser: null},
        providers: undefined,
        setAuthState: vi.fn(),
        setProviders: vi.fn(),
        handleCallback: vi.fn(),
        getLoginUrls: vi.fn(),
        logout: vi.fn(),
        dispose: vi.fn(),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subscribe: (observer: any) => {
        observer.next({type: 'logged-in', token: 'test-token', currentUser: null})
        return unsubscribeSpy
      },
    }))

    // Verify that the unsubscribe function was called
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1)
  })
})
