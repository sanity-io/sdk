import {type AuthStore, createSanityInstance, getAuthStore} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useAuthToken} from './useAuthToken'

// Mock dependencies
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()

  return {
    getAuthStore: vi.fn(),
    createSanityInstance: original.createSanityInstance,
  }
})

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

describe('useAuthToken', () => {
  const instance = createSanityInstance({
    projectId: 'test-project-id',
    dataset: 'test-dataset',
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
    const mockAuthStore = createMockAuthStore(null)

    vi.mocked(useSanityInstance).mockReturnValue(instance)
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore)

    const {result} = renderHook(() => useAuthToken())

    expect(result.current).toBeNull()
    expect(useSanityInstance).toHaveBeenCalled()
    expect(getAuthStore).toHaveBeenCalledWith(instance)
  })

  it('should return token when authenticated', () => {
    const mockToken = 'test-auth-token'
    const mockAuthStore = createMockAuthStore(mockToken)

    vi.mocked(useSanityInstance).mockReturnValue(instance)
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore)

    const {result} = renderHook(() => useAuthToken())

    expect(result.current).toBe(mockToken)
    expect(useSanityInstance).toHaveBeenCalled()
    expect(getAuthStore).toHaveBeenCalledWith(instance)
  })
})
