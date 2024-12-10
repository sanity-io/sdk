import type {CurrentUser} from '@sanity/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createInternalAuthStore} from './internalAuthStore'

// Define mockClient before vi.mock
const mockClient = {
  request: vi.fn().mockResolvedValue({}),
}

// Move mock before any usage
vi.mock('@sanity/client', () => ({
  createClient: () => mockClient,
}))

const instance = {
  identity: {
    id: '123abcStore',
    projectId: 'test-project',
    dataset: 'test-dataset',
  },
  config: {},
} as const

const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  length: 0,
  clear: vi.fn(),
  key: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStorage.getItem.mockReturnValue(null)
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
})
