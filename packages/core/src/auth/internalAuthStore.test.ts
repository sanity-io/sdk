import type {CurrentUser} from '@sanity/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {getInternalAuthStore} from './getInternalAuthStore'
import {createInternalAuthStore} from './internalAuthStore'

// Define mockClient before vi.mock
const mockClient = {
  request: vi.fn().mockResolvedValue({}),
}

// Move mock before any usage
vi.mock('@sanity/client', () => ({
  createClient: () => mockClient,
}))

const instance = createSanityInstance({
  projectId: 'test-project',
  dataset: 'test-dataset',
})

const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  length: 0,
  clear: vi.fn(),
  key: vi.fn(),
}

// Add this mock setup at the top with other mocks
const mockWindow = {
  localStorage: mockStorage,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}

class MockStorageEvent {
  key: string | null
  newValue: string | null
  storageArea: Storage | null

  constructor(_type: string, eventInit?: StorageEventInit) {
    this.key = eventInit?.key ?? null
    this.newValue = eventInit?.newValue ?? null
    this.storageArea = eventInit?.storageArea ?? null
  }
}

// Mock StorageEvent globally
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.StorageEvent = MockStorageEvent as any

beforeEach(() => {
  vi.clearAllMocks()
  mockStorage.getItem.mockReturnValue(null)
  // Set up window mock for each test
  global.window = mockWindow as unknown as Window & typeof globalThis
})

afterEach(() => {
  // Clean up window mock after each test
  global.window = undefined as unknown as Window & typeof globalThis
})

describe('createInternalAuthStore', () => {
  it('initializes with logged-out state when no token is present', () => {
    const store = createInternalAuthStore(instance, {storageArea: mockStorage})
    expect(store.getState().authState).toEqual({type: 'logged-out', isDestroyingSession: false})
  })

  it('initializes with logged-in state when token is provided', () => {
    const store = createInternalAuthStore(instance, {
      token: 'static-token',
      storageArea: mockStorage,
    })
    expect(store.getState().authState).toEqual({
      type: 'logged-in',
      token: 'static-token',
      currentUser: null,
    })
  })

  it('initializes with logged-in state and defaults to local storage', () => {
    global.window = mockWindow as unknown as typeof window

    const store = createInternalAuthStore(instance, {
      token: 'static-token',
    })
    expect(store.getState().authState).toEqual({
      type: 'logged-in',
      token: 'static-token',
      currentUser: null,
    })

    // Cleanup
    global.window = undefined as unknown as Window & typeof globalThis
  })

  it('handles successful login callback', async () => {
    mockClient.request.mockResolvedValueOnce({token: 'new-token'})

    const store = createInternalAuthStore(instance, {
      storageArea: mockStorage,
      initialLocationHref: 'http://localhost/#sid=callback-code',
    })

    const result = await store
      .getState()
      .handleCallback(new URL('http://localhost/#sid=callback-code').href)
    expect(result).toBe('http://localhost/')
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      '__sanity_auth_token_test-project_test-dataset',
      JSON.stringify({token: 'new-token'}),
    )
    expect(store.getState().authState).toEqual({
      type: 'logged-in',
      token: 'new-token',
      currentUser: {},
    })
  })

  it('fetches login URLs', async () => {
    const mockProviders = [
      {name: 'google', title: 'Google', url: 'http://api.sanity.io/auth/google'},
    ]
    mockClient.request.mockResolvedValueOnce({providers: mockProviders})

    const store = createInternalAuthStore(instance, {storageArea: mockStorage})
    const providers = await store.getState().getLoginUrls()

    expect(providers[0]).toMatchObject({
      name: 'google',
      title: 'Google',
      url: expect.stringContaining('http://api.sanity.io/auth/google'),
    })
  })

  it('handles logout', async () => {
    mockStorage.getItem.mockReturnValueOnce(JSON.stringify({token: 'stored-token'}))
    const store = createInternalAuthStore(instance, {storageArea: mockStorage})

    await store.getState().logout()

    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/auth/logout',
      method: 'POST',
    })
    expect(mockStorage.removeItem).toHaveBeenCalledWith(
      '__sanity_auth_token_test-project_test-dataset',
    )
    expect(store.getState().authState).toEqual({
      type: 'logged-out',
      isDestroyingSession: false,
    })
  })

  it('fetches current user after login', async () => {
    const mockUser: CurrentUser = {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'developer',
      roles: [{name: 'developer', title: 'Developer'}],
    }

    mockClient.request.mockResolvedValueOnce({token: 'new-token'}).mockResolvedValueOnce(mockUser)

    const store = createInternalAuthStore(instance, {
      storageArea: mockStorage,
      initialLocationHref: 'http://localhost/#sid=callback-code',
    })

    await store.getState().handleCallback(new URL('http://localhost/#sid=callback-code').href)

    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/users/me',
      method: 'GET',
    })

    expect(store.getState().authState).toEqual({
      type: 'logged-in',
      token: 'new-token',
      currentUser: mockUser,
    })
  })

  it('handles error during token exchange', async () => {
    mockClient.request.mockRejectedValueOnce(new Error('Token exchange failed'))

    const store = createInternalAuthStore(instance, {
      storageArea: mockStorage,
      initialLocationHref: 'http://localhost/#sid=callback-code',
    })

    const result = await store
      .getState()
      .handleCallback(new URL('http://localhost/#sid=callback-code').href)

    expect(result).toBe(false)
    expect(store.getState().authState).toEqual({
      type: 'error',
      error: new Error('Token exchange failed'),
    })
  })

  it('handles error during user fetch', async () => {
    mockClient.request
      .mockResolvedValueOnce({token: 'new-token'})
      .mockRejectedValueOnce(new Error('User fetch failed'))

    const store = createInternalAuthStore(instance, {
      storageArea: mockStorage,
      initialLocationHref: 'http://localhost/#sid=callback-code',
    })

    await store.getState().handleCallback(new URL('http://localhost/#sid=callback-code').href)

    // Add a small delay to allow the async user fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(store.getState().authState).toEqual({
      type: 'error',
      token: 'new-token',
      currentUser: null,
      error: new Error('User fetch failed'),
    })
  })

  it('handles custom providers function', async () => {
    const customProvider = {
      name: 'custom',
      title: 'Custom',
      url: 'http://custom.auth',
    }

    mockClient.request.mockResolvedValueOnce({
      providers: [{name: 'google', title: 'Google', url: 'http://api.sanity.io/auth/google'}],
    })

    const store = createInternalAuthStore(instance, {
      storageArea: mockStorage,
      providers: (defaultProviders) => [...defaultProviders, customProvider],
    })

    const providers = await store.getState().getLoginUrls()

    expect(providers).toHaveLength(2)
    expect(providers[1]).toMatchObject({
      name: 'custom',
      title: 'Custom',
      url: expect.stringContaining('http://custom.auth'),
    })
  })

  it('handles logout during in-flight logout', async () => {
    mockStorage.getItem.mockReturnValueOnce(JSON.stringify({token: 'stored-token'}))
    const store = createInternalAuthStore(instance, {storageArea: mockStorage})

    // Start first logout
    const firstLogout = store.getState().logout()
    // Attempt second logout before first completes
    const secondLogout = store.getState().logout()

    await Promise.all([firstLogout, secondLogout])

    // Should only make one logout request
    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/auth/logout',
      method: 'POST',
    })
    expect(
      mockClient.request.mock.calls.filter((call) => call[0].uri === '/auth/logout'),
    ).toHaveLength(1)
  })

  it('handles storage events', () => {
    const store = createInternalAuthStore(instance, {
      storageArea: mockStorage,
    })

    // Mock the storage to return the new token when checked
    mockStorage.getItem.mockReturnValue(JSON.stringify({token: 'new-token'}))

    // Simulate storage event
    const storageEvent = new StorageEvent('storage', {
      key: '__sanity_auth_token_test-project_test-dataset',
      newValue: JSON.stringify({token: 'new-token'}),
      storageArea: mockStorage,
    })

    // Get the storage event handler
    const [[eventName, handler]] = mockWindow.addEventListener.mock.calls
    expect(eventName).toBe('storage')

    // Manually call the handler
    handler(storageEvent)

    expect(store.getState().authState).toEqual({
      type: 'logged-in',
      token: 'new-token',
      currentUser: null,
    })
  })
})

describe('getInternalAuthStore', () => {
  it('returns the same store instance for the same sanity instance', () => {
    const store1 = getInternalAuthStore(instance)
    const store2 = getInternalAuthStore(instance)

    expect(store1).toBe(store2)
  })

  it('creates different stores for different instances', () => {
    const instance2 = {
      ...instance,
      identity: {
        ...instance.identity,
        id: 'different-id',
      },
    }

    const store1 = getInternalAuthStore(instance)
    const store2 = getInternalAuthStore(instance2)

    expect(store1).not.toBe(store2)
  })
})
