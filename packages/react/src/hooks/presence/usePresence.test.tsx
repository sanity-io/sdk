import {getPresence, type SanityUser, type UserPresence} from '@sanity/sdk'
import {NEVER} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {act, renderHook} from '../../../test/test-utils'
import {usePresence} from './usePresence'

vi.mock('@sanity/sdk', () => ({
  getPresence: vi.fn(),
  createSanityInstance: vi.fn(() => ({
    createChild: vi.fn(),
    isDisposed: vi.fn(() => false),
    dispose: vi.fn(),
  })),
}))

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(() => ({config: {projectId: 'test', dataset: 'test'}})),
}))

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
    vi.mocked(getPresence).mockReturnValue(mockPresenceSource)

    const {result, unmount} = renderHook(() => usePresence())

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
})
