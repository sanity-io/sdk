import {
  type AuthState,
  AuthStateType,
  type AuthStore,
  createSanityInstance,
  getAuthStore,
  type LoggedInAuthState,
  type SanityInstance,
} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {SanityProvider} from '../../components/context/SanityProvider'
import * as context from '../context/useSanityInstance'
import {useAuthState} from './useAuthState'

// Mock dependencies
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    getAuthStore: vi.fn(),
    createSanityInstance: original.createSanityInstance,
  }
})
vi.mock('../context/useSanityInstance')

const createMockAuthStore = (authState: AuthState): AuthStore => ({
  authState: {
    getState: () => authState,
    getInitialState: () => authState,
    subscribe: vi.fn(),
  },
  tokenState: {
    getState: vi.fn(),
    getInitialState: vi.fn(),
    subscribe: vi.fn(),
  },
  currentUserState: {
    getState: vi.fn(),
    getInitialState: vi.fn(),
    subscribe: vi.fn(),
  },
  handleCallback: vi.fn(),
  logout: vi.fn(),
  dispose: vi.fn(),
  getLoginUrls: vi.fn(),
})

const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  role: 'developer',
  roles: [{name: 'developer', title: 'Developer'}],
}

describe('useAuthState', () => {
  const instance: SanityInstance = createSanityInstance({
    projectId: 'project-123',
    dataset: 'dataset-123',
  })

  // Setup mock for useSanityInstance
  beforeEach(() => {
    vi.spyOn(context, 'useSanityInstance').mockReturnValue(instance)
  })

  it('should return the current auth state', () => {
    const mockAuthStore = createMockAuthStore({
      type: AuthStateType.LOGGED_IN,
      token: 'token-123',
      currentUser: mockUser,
    })
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore)

    const sanityInstance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const {result} = renderHook(() => useAuthState(), {
      wrapper: ({children}) => (
        <SanityProvider sanityInstance={sanityInstance}>{children}</SanityProvider>
      ),
    })
    const current = result.current as LoggedInAuthState
    expect(current.type).toBe(AuthStateType.LOGGED_IN)
    expect(current.token).toBe('token-123')
    expect(current.currentUser).toBe(mockUser)
  })

  it('should handle signed out state', () => {
    const mockAuthStore = createMockAuthStore({
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    })
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore)

    const {result} = renderHook(() => useAuthState())
    expect(result.current.type).toBe(AuthStateType.LOGGED_OUT)
  })

  it('should subscribe to auth state changes', () => {
    const subscribe = vi.fn()
    const mockAuthStore = createMockAuthStore({
      type: AuthStateType.LOGGED_IN,
      token: 'token-123',
      currentUser: null,
    })
    mockAuthStore.authState.subscribe = subscribe

    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore)

    renderHook(() => useAuthState())
    expect(subscribe).toHaveBeenCalled()
  })
})
