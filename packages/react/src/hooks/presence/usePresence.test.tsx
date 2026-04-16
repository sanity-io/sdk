import {getPresenceState, type SanityUser, type UserPresence} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {NEVER} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {usePresence} from './usePresence'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...actual,
    getPresenceState: vi.fn(),
    createSanityInstance: vi.fn(() => ({
      isDisposed: vi.fn(() => false),
      dispose: vi.fn(),
    })),
  }
})

describe('usePresence', () => {
  it('should return presence locations and update when the store changes', () => {
    const initialLocations: UserPresence[] = [
      {
        user: {
          sanityUserId: 'user1',
          profile: undefined,
          memberships: [],
        } as unknown as SanityUser,
        sessionId: 'session1',
        state: 'online',
        lastActiveAt: new Date().toISOString(),
      },
    ] as unknown as UserPresence[]
    const updatedLocations: UserPresence[] = [
      ...initialLocations,
      {
        user: {
          sanityUserId: 'user2',
          profile: undefined,
          memberships: [],
        } as unknown as SanityUser,
        sessionId: 'session2',
        state: 'online',
        lastActiveAt: new Date().toISOString(),
      },
    ] as unknown as UserPresence[]

    let onStoreChange: () => void = () => {}
    const getCurrent = vi.fn().mockReturnValue(initialLocations)
    const mockPresenceSource = {
      // It's called once for the server snapshot, and once for the client
      getCurrent,
      subscribe: vi.fn((callback) => {
        onStoreChange = callback
        // Return an unsubscribe function
        return () => {}
      }),
      observable: NEVER,
    }
    vi.mocked(getPresenceState).mockReturnValue(mockPresenceSource)

    const {result, unmount} = renderHook(() => usePresence(), {
      wrapper: ({children}) => (
        <ResourceProvider
          resource={{projectId: 'test-project', dataset: 'test-dataset'}}
          fallback={null}
        >
          {children}
        </ResourceProvider>
      ),
    })

    // Initial state should be correct
    expect(result.current.locations).toEqual(initialLocations)
    expect(getCurrent).toHaveBeenCalled()
    expect(mockPresenceSource.subscribe).toHaveBeenCalledTimes(1)

    // Update state
    getCurrent.mockReturnValue(updatedLocations)
    act(() => {
      onStoreChange()
    })

    // The hook should have been updated
    expect(result.current.locations).toEqual(updatedLocations)
    unmount()
  })

  it('should throw an error when used with a media library resource', () => {
    expect(() => {
      renderHook(() => usePresence({resource: {mediaLibraryId: 'ml123'}}), {
        wrapper: ({children}) => (
          <ResourceProvider
            resource={{projectId: 'test-project', dataset: 'test-dataset'}}
            fallback={null}
          >
            {children}
          </ResourceProvider>
        ),
      })
    }).toThrow('usePresence() does not support media library resources')
  })

  it('should work with a dataset resource', () => {
    const mockPresenceSource = {
      getCurrent: vi.fn().mockReturnValue([]),
      subscribe: vi.fn(() => () => {}),
      observable: NEVER,
    }
    vi.mocked(getPresenceState).mockReturnValue(mockPresenceSource)

    const {result, unmount} = renderHook(
      () => usePresence({resource: {projectId: 'test-project', dataset: 'test-dataset'}}),
      {
        wrapper: ({children}) => (
          <ResourceProvider
            resource={{projectId: 'test-project', dataset: 'test-dataset'}}
            fallback={null}
          >
            {children}
          </ResourceProvider>
        ),
      },
    )

    expect(result.current.locations).toEqual([])
    unmount()
  })
})
