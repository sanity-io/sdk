import {describe, expect, it, vi} from 'vitest'
import {renderHook} from '@testing-library/react'
import {useAuthState} from './useAuthState'
import {getAuthStore, type AuthStore} from '@sanity/sdk'
import {SanityProvider} from '../../components/context/SanityProvider'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getAuthStore: vi.fn(),
  }
})

describe('useAuthState', () => {
  it('should return initial auth state', () => {
    // Setup mock auth store
    const mockAuthStore = {
      subscribe: vi.fn(),
      getCurrent: vi.fn().mockReturnValue({type: 'logged-in'}),
      handleCallback: vi.fn(),
      getLoginUrls: vi.fn(),
      logout: vi.fn(),
      dispose: vi.fn(),
    }

    // Mock getAuthStore to return our mock store
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as AuthStore)

    // Wrap hook in SanityProvider and render
    const {result} = renderHook(() => useAuthState(), {
      wrapper: ({children}) => (
        <SanityProvider config={{projectId: 'test', dataset: 'test'}}>{children}</SanityProvider>
      ),
    })

    // Assert initial state
    expect(result.current).toBe('logged-in')
  })

  it('should update when auth state changes', () => {
    // Add a variable to track current state
    let currentState = {type: 'logged-in'}

    const subscribers: {next: (state: any) => void}[] = []

    const mockAuthStore = {
      subscribe: vi.fn((subscriber) => {
        subscribers.push(subscriber)
        subscriber.next(currentState)
        return {
          unsubscribe: () => {
            const index = subscribers.indexOf(subscriber)
            if (index > -1) subscribers.splice(index, 1)
          },
        }
      }),
      // Update getCurrent to return the current state
      getCurrent: vi.fn().mockImplementation(() => currentState),
      handleCallback: vi.fn(),
      getLoginUrls: vi.fn(),
      logout: vi.fn(),
      dispose: vi.fn(),
    }

    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as unknown as AuthStore)

    const {result} = renderHook(() => useAuthState(), {
      wrapper: ({children}) => (
        <SanityProvider config={{projectId: 'test', dataset: 'test'}}>{children}</SanityProvider>
      ),
    })

    // Assert initial state
    expect(result.current).toBe('logged-in')

    // Update currentState when simulating auth state change
    currentState = {type: 'logged-out'}
    subscribers.forEach((subscriber) => subscriber.next(currentState))

    // Assert updated state
    expect(result.current).toBe('logged-out')
  })
})
