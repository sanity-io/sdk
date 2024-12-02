import {renderHook} from '@testing-library/react'
import {useCurrentUser} from './useCurrentUser'
import {type CurrentUser, type SanityInstance} from '@sanity/sdk'
import {describe, it, expect, vi, beforeEach} from 'vitest'

const {createStore: realCreateStore} = await vi.importActual<typeof import('zustand')>('zustand')

// Mock the zustand store
const mockUser = {id: '123', name: 'Test User'} as CurrentUser
let currentMockUser: CurrentUser | null = mockUser
const mockSessionStore = realCreateStore(() => ({user: currentMockUser}))

vi.mock('zustand', () => ({
  useStore: () => currentMockUser,
}))

vi.mock('@sanity/sdk', () => ({
  getSessionStore: () => mockSessionStore,
}))

describe('useCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentMockUser = mockUser
  })

  it('should return the current user when authenticated', () => {
    const sanityInstance = {} as SanityInstance
    const {result} = renderHook(() => useCurrentUser(sanityInstance))

    expect(result.current).toEqual(mockUser)
  })

  it('should return null when not authenticated', () => {
    currentMockUser = null

    const sanityInstance = {} as SanityInstance
    const {result} = renderHook(() => useCurrentUser(sanityInstance))

    expect(result.current).toBeNull()
  })
})
