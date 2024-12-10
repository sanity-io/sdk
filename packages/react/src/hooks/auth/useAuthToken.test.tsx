import {type AuthStore, getAuthStore, type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useAuthToken} from './useAuthToken'

// Mock dependencies
vi.mock('@sanity/sdk', () => ({
  getAuthStore: vi.fn(),
}))

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

describe('useAuthToken', () => {
  // Helper function to create mock instance
  const createMockInstance = (): SanityInstance => ({
    identity: {
      id: 'abc123',
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    },
    config: {},
  })

  // Helper function to create mock auth store
  const createMockAuthStore = (token: string | null) => {
    const authType = token ? 'logged-in' : 'logged-out'
    return {
      tokenState: {
        getInitialState: () => token,
        getState: () => token,
        subscribe: vi.fn(),
      },
      authState: {
        getInitialState: () => ({
          type: authType,
          isDestroyingSession: false,
          ...(token && {token, currentUser: null}),
        }),
        getState: () => ({
          type: authType,
          isDestroyingSession: false,
          ...(token && {token, currentUser: null}),
        }),
        subscribe: vi.fn(),
      },
      currentUserState: {
        getInitialState: () => null,
        getState: () => null,
        subscribe: vi.fn(),
      },
      handleCallback: vi.fn(),
      logout: vi.fn(),
      dispose: vi.fn(),
      getLoginUrls: vi.fn(),
    } as unknown as AuthStore
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null when no token is present', () => {
    const mockInstance = createMockInstance()
    const mockAuthStore = createMockAuthStore(null)

    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore)

    const {result} = renderHook(() => useAuthToken())

    expect(result.current).toBeNull()
    expect(useSanityInstance).toHaveBeenCalled()
    expect(getAuthStore).toHaveBeenCalledWith(mockInstance)
  })

  it('should return token when authenticated', () => {
    const mockInstance = createMockInstance()
    const mockToken = 'test-auth-token'
    const mockAuthStore = createMockAuthStore(mockToken)

    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore)

    const {result} = renderHook(() => useAuthToken())

    expect(result.current).toBe(mockToken)
    expect(useSanityInstance).toHaveBeenCalled()
    expect(getAuthStore).toHaveBeenCalledWith(mockInstance)
  })
})
