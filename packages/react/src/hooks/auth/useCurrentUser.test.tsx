import {type AuthStore, type CurrentUser, getAuthStore, type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useCurrentUser} from './useCurrentUser'

// Mock dependencies
vi.mock('../context/useSanityInstance')
vi.mock('@sanity/sdk')

const mockUser: CurrentUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin',
  roles: [],
}

describe('useCurrentUser', () => {
  it('returns the current user when authenticated', () => {
    vi.mocked(useSanityInstance).mockReturnValue({} as unknown as SanityInstance)

    // Mock the auth store with an authenticated user
    vi.mocked(getAuthStore).mockReturnValue({
      currentUserState: {
        getState: () => mockUser,
        subscribe: vi.fn(),
      },
    } as unknown as AuthStore)

    const {result} = renderHook(() => useCurrentUser())
    expect(result.current).toEqual(mockUser)
  })

  it('returns null when not authenticated', () => {
    vi.mocked(useSanityInstance).mockReturnValue({} as unknown as SanityInstance)

    // Mock the auth store with no user
    vi.mocked(getAuthStore).mockReturnValue({
      currentUserState: {
        getState: () => null,
        subscribe: vi.fn(),
      },
    } as unknown as AuthStore)

    const {result} = renderHook(() => useCurrentUser())
    expect(result.current).toBeNull()
  })
})
