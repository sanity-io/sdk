import {type AuthStore, createSanityInstance, getAuthStore} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useLogOut} from './useLogOut'

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

describe('useLogOut', () => {
  it('should return logout function from auth store', () => {
    // Setup mocks
    const instance = createSanityInstance({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    })

    const mockLogout = vi.fn()
    const mockAuthStore: AuthStore = {
      authState: {
        getInitialState: vi.fn(),
        getState: vi.fn(),
        subscribe: vi.fn(),
      },
      tokenState: {
        getInitialState: vi.fn(),
        getState: vi.fn(),
        subscribe: vi.fn(),
      },
      currentUserState: {
        getInitialState: vi.fn(),
        getState: vi.fn(),
        subscribe: vi.fn(),
      },
      handleCallback: vi.fn(),
      logout: mockLogout,
      dispose: vi.fn(),
      getLoginUrls: vi.fn(),
    }

    vi.mocked(useSanityInstance).mockReturnValue(instance)
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore)

    // Test the hook
    const {result} = renderHook(() => useLogOut())

    // Verify the returned function is the logout function
    expect(result.current).toBe(mockLogout)
    expect(useSanityInstance).toHaveBeenCalled()
    expect(getAuthStore).toHaveBeenCalledWith(instance)

    // Verify the logout function can be called
    result.current()
    expect(mockLogout).toHaveBeenCalled()
  })
})
