import {getAuthProviders} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useLoginLinks} from './useLoginLinks'

// Mock the @sanity/sdk module
vi.mock('@sanity/sdk', () => ({
  getAuthProviders: vi.fn(),
}))

describe('useLoginLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return auth providers for given project ID', () => {
    const mockProviders = [
      {
        name: 'google',
        title: 'Google',
        url: 'https://api.sanity.io/v1/auth/google',
      },
    ]

    // Setup the mock implementation
    vi.mocked(getAuthProviders).mockReturnValue(mockProviders)

    const {result} = renderHook(() => useLoginLinks())

    expect(getAuthProviders).toHaveBeenCalledWith(window.location.href)
    expect(result.current).toEqual(mockProviders)
  })

  it('should memoize results for same inputs', () => {
    const mockProviders = [
      {
        name: 'github',
        title: 'GitHub',
        url: 'https://api.sanity.io/v1/auth/github',
      },
    ]

    vi.mocked(getAuthProviders).mockReturnValue(mockProviders)

    const {result, rerender} = renderHook(() => useLoginLinks())

    const firstResult = result.current
    const initialCallCount = vi.mocked(getAuthProviders).mock.calls.length

    // Rerender with same props
    rerender()

    // Should return the same array reference
    expect(result.current).toBe(firstResult)

    // No additional calls should be made after rerender
    expect(vi.mocked(getAuthProviders).mock.calls.length).toBe(initialCallCount)
  })
})
