import {getActiveReleasesState, type ReleaseDocument, type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {BehaviorSubject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useActiveReleases} from './useActiveReleases'

// Mock the useSanityInstance hook
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

// Mock the getActiveReleasesState function
vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    getActiveReleasesState: vi.fn(),
  }
})

describe('useActiveReleases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should suspend when initial state is undefined', () => {
    const mockInstance = {} as SanityInstance
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    const mockSubject = new BehaviorSubject<ReleaseDocument[] | undefined>(undefined)
    const mockStateSource = {
      subscribe: vi.fn((callback) => {
        const subscription = mockSubject.subscribe(callback)
        return () => subscription.unsubscribe()
      }),
      getCurrent: vi.fn(() => undefined),
      observable: mockSubject,
    }

    vi.mocked(getActiveReleasesState).mockReturnValue(mockStateSource)

    const {result} = renderHook(() => {
      try {
        return useActiveReleases()
      } catch (e) {
        return e
      }
    })

    // Verify that the hook threw a promise (suspended)
    expect(result.current).toBeInstanceOf(Promise)
    expect(mockStateSource.getCurrent).toHaveBeenCalled()
  })

  it('should resolve with releases when data is available', () => {
    const mockInstance = {} as SanityInstance
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    const mockReleases: ReleaseDocument[] = [
      {_id: 'release1', _type: 'release'} as ReleaseDocument,
      {_id: 'release2', _type: 'release'} as ReleaseDocument,
    ]

    const mockSubject = new BehaviorSubject<ReleaseDocument[]>(mockReleases)
    const mockStateSource = {
      subscribe: vi.fn((callback) => {
        const subscription = mockSubject.subscribe(callback)
        return () => subscription.unsubscribe()
      }),
      getCurrent: vi.fn(() => mockReleases),
      observable: mockSubject,
    }

    vi.mocked(getActiveReleasesState).mockReturnValue(mockStateSource)

    const {result} = renderHook(() => useActiveReleases())

    // Verify that the hook returned the releases without suspending
    expect(result.current).toEqual(mockReleases)
    expect(mockStateSource.getCurrent).toHaveBeenCalled()
  })
})
