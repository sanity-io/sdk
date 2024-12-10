import type {CurrentUser} from '@sanity/types'
import {beforeEach, describe, expect, type Mock, test, vi} from 'vitest'

import type {SanityInstance} from '../instance/types'
import {getAuthStore} from './authStore'
import {getInternalAuthStore} from './getInternalAuthStore'

// Mock the getInternalAuthStore module
vi.mock('./getInternalAuthStore')

describe('authStore', () => {
  const mockCurrentUser: CurrentUser = {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    profileImage: 'https://example.com/image.jpg',
    role: 'admin',
    roles: [],
  }

  const mockLoggedInState = {
    authState: {
      type: 'logged-in' as const,
      token: 'mock-token',
      currentUser: mockCurrentUser,
    },
    handleCallback: vi.fn(),
    logout: vi.fn(),
    dispose: vi.fn(),
    getLoginUrls: vi.fn(),
  }

  const mockLoggedOutState = {
    authState: {
      type: 'logged-out' as const,
      isDestroyingSession: false,
    },
    handleCallback: vi.fn(),
    logout: vi.fn(),
    dispose: vi.fn(),
    getLoginUrls: vi.fn(),
  }

  const mockInternalStore = {
    getState: vi.fn(() => mockLoggedInState),
    getInitialState: vi.fn(() => mockLoggedInState),
    subscribe: vi.fn((_selector, _listener) => vi.fn()),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(getInternalAuthStore as Mock).mockReturnValue(mockInternalStore)
  })

  test('creates auth store with all required methods', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)

    expect(store).toHaveProperty('authState')
    expect(store).toHaveProperty('tokenState')
    expect(store).toHaveProperty('currentUserState')
    expect(store).toHaveProperty('handleCallback')
    expect(store).toHaveProperty('logout')
    expect(store).toHaveProperty('dispose')
    expect(store).toHaveProperty('getLoginUrls')
  })

  test('authState returns correct state when logged in', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)

    expect(store.authState.getState()).toBe(mockLoggedInState.authState)
    expect(store.authState.getInitialState()).toBe(mockLoggedInState.authState)
  })

  test('tokenState returns correct token when logged in', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)

    expect(store.tokenState.getState()).toBe('mock-token')
    expect(store.tokenState.getInitialState()).toBe('mock-token')
  })

  test('tokenState returns null when logged out', () => {
    const mockInstance = {} as SanityInstance
    mockInternalStore.getState.mockReturnValue({
      ...mockLoggedOutState,
      authState: mockLoggedOutState.authState,
    } as unknown as typeof mockLoggedInState)

    mockInternalStore.getInitialState.mockReturnValue({
      ...mockLoggedOutState,
      authState: mockLoggedOutState.authState,
    } as unknown as typeof mockLoggedInState)

    const store = getAuthStore(mockInstance)

    expect(store.tokenState.getState()).toBeNull()
    expect(store.tokenState.getInitialState()).toBeNull()
  })

  test('currentUserState returns correct user when logged in', () => {
    const mockInstance = {} as SanityInstance
    mockInternalStore.getState.mockReturnValue(mockLoggedInState)
    mockInternalStore.getInitialState.mockReturnValue(mockLoggedInState)

    const store = getAuthStore(mockInstance)

    expect(store.currentUserState.getState()).toBe(mockCurrentUser)
    expect(store.currentUserState.getInitialState()).toBe(mockCurrentUser)
  })

  test('currentUserState returns null when logged out', () => {
    const mockInstance = {} as SanityInstance
    mockInternalStore.getState.mockReturnValue({
      ...mockLoggedOutState,
      authState: mockLoggedOutState.authState,
    } as unknown as typeof mockLoggedInState)

    mockInternalStore.getInitialState.mockReturnValue({
      ...mockLoggedOutState,
      authState: mockLoggedOutState.authState,
    } as unknown as typeof mockLoggedInState)

    const store = getAuthStore(mockInstance)

    expect(store.currentUserState.getState()).toBeNull()
    expect(store.currentUserState.getInitialState()).toBeNull()
  })

  test('subscribe callbacks are properly set up', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)
    const mockListener = vi.fn()

    store.authState.subscribe(mockListener)
    store.tokenState.subscribe(mockListener)
    store.currentUserState.subscribe(mockListener)

    expect(mockInternalStore.subscribe).toHaveBeenCalledTimes(3)
  })

  test('tokenState.getInitialState returns null when initial state is logged out', () => {
    const mockInstance = {} as SanityInstance
    mockInternalStore.getInitialState.mockReturnValue({
      ...mockLoggedOutState,
      authState: mockLoggedOutState.authState,
    } as unknown as typeof mockLoggedInState)

    const store = getAuthStore(mockInstance)
    expect(store.tokenState.getInitialState()).toBeNull()
  })

  test('currentUserState.getInitialState returns null when initial state is logged out', () => {
    const mockInstance = {} as SanityInstance
    mockInternalStore.getInitialState.mockReturnValue({
      ...mockLoggedOutState,
      authState: mockLoggedOutState.authState,
    } as unknown as typeof mockLoggedInState)

    const store = getAuthStore(mockInstance)

    expect(store.currentUserState.getInitialState()).toBeNull()
  })

  test('tokenState.subscribe works correctly', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)
    const mockListener = vi.fn()

    store.tokenState.subscribe(mockListener)

    // Simulate a state change to 'logged-in' with a new token
    mockInternalStore.subscribe.mock.calls[0][0](
      {
        authState: {type: 'logged-in', token: 'new-token', currentUser: mockCurrentUser},
      },
      {
        authState: {type: 'logged-in', token: 'mock-token', currentUser: mockCurrentUser},
      },
    )

    expect(mockListener).toHaveBeenCalledWith('new-token', 'mock-token')
  })

  test('currentUserState.subscribe works correctly', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)
    const mockListener = vi.fn()

    store.currentUserState.subscribe(mockListener)

    // Simulate a state change to 'logged-in' with a new user
    mockInternalStore.subscribe.mock.calls[0][0](
      {
        authState: {
          type: 'logged-in',
          token: 'mock-token',
          currentUser: {...mockCurrentUser, name: 'New Name'},
        },
      },
      {
        authState: {type: 'logged-in', token: 'mock-token', currentUser: mockCurrentUser},
      },
    )

    expect(mockListener).toHaveBeenCalledWith(
      {...mockCurrentUser, name: 'New Name'},
      mockCurrentUser,
    )
  })

  test('tokenState.subscribe handles logged-out state correctly', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)
    const mockListener = vi.fn()

    store.tokenState.subscribe(mockListener)

    // Simulate a state change to 'logged-out'
    mockInternalStore.subscribe.mock.calls[0][0](
      {
        authState: {type: 'logged-out', isDestroyingSession: false},
      },
      {
        authState: {type: 'logged-in', token: 'mock-token', currentUser: mockCurrentUser},
      },
    )

    expect(mockListener).toHaveBeenCalledWith(null, 'mock-token')
  })

  test('currentUserState.subscribe handles logged-out state correctly', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)
    const mockListener = vi.fn()

    store.currentUserState.subscribe(mockListener)

    // Simulate a state change to 'logged-out'
    mockInternalStore.subscribe.mock.calls[0][0](
      {
        authState: {type: 'logged-out', isDestroyingSession: false},
      },
      {
        authState: {type: 'logged-in', token: 'mock-token', currentUser: mockCurrentUser},
      },
    )

    expect(mockListener).toHaveBeenCalledWith(null, mockCurrentUser)
  })

  test('tokenState.subscribe handles transition from logged-out to logged-in correctly', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)
    const mockListener = vi.fn()

    store.tokenState.subscribe(mockListener)

    // Simulate a state change from 'logged-out' to 'logged-in'
    mockInternalStore.subscribe.mock.calls[0][0](
      {
        authState: {type: 'logged-in', token: 'new-token', currentUser: mockCurrentUser},
      },
      {
        authState: {type: 'logged-out', isDestroyingSession: false},
      },
    )

    expect(mockListener).toHaveBeenCalledWith('new-token', null)
  })

  test('currentUserState.subscribe handles transition from logged-out to logged-in correctly', () => {
    const mockInstance = {} as SanityInstance
    const store = getAuthStore(mockInstance)
    const mockListener = vi.fn()

    store.currentUserState.subscribe(mockListener)

    // Simulate a state change from 'logged-out' to 'logged-in'
    mockInternalStore.subscribe.mock.calls[0][0](
      {
        authState: {
          type: 'logged-in',
          token: 'new-token',
          currentUser: {...mockCurrentUser, name: 'Updated User'},
        },
      },
      {
        authState: {type: 'logged-out', isDestroyingSession: false},
      },
    )

    expect(mockListener).toHaveBeenCalledWith({...mockCurrentUser, name: 'Updated User'}, null)
  })
})
