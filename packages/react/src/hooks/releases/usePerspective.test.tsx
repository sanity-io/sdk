import {type ClientPerspective} from '@sanity/client'
import {
  getActiveReleasesState,
  getPerspectiveState,
  type PerspectiveHandle,
  type ReleaseDocument,
  type SanityInstance,
} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {BehaviorSubject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {usePerspective} from './usePerspective'

// Mock the useSanityInstance hook
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

// Mock the SDK functions
vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    getPerspectiveState: vi.fn(),
    // getPerspectiveState uses getActiveReleasesState
    // to determine if it should suspend
    getActiveReleasesState: vi.fn(),
  }
})

describe('usePerspective', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should suspend when initial state is undefined', () => {
    const mockInstance = {} as SanityInstance
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    const perspectiveHandle: PerspectiveHandle = {
      perspective: 'published',
    }

    const mockSubject = new BehaviorSubject<ClientPerspective | undefined>(undefined)
    const mockStateSource = {
      subscribe: vi.fn((callback) => {
        const subscription = mockSubject.subscribe(callback)
        return () => subscription.unsubscribe()
      }),
      getCurrent: vi.fn(() => undefined),
      observable: mockSubject,
    }

    // Mock the active releases observable for the suspender
    const mockReleaseDoc: ReleaseDocument = {
      _id: 'release1',
      _type: 'release',
      _createdAt: '2021-01-01T00:00:00Z',
      _updatedAt: '2021-01-01T00:00:00Z',
      _rev: 'rev1',
      name: 'Test Release',
      metadata: {
        title: 'Test Release',
        releaseType: 'asap',
      },
    }
    const mockReleasesSubject = new BehaviorSubject([mockReleaseDoc])
    const mockReleasesStateSource = {
      subscribe: vi.fn(),
      getCurrent: vi.fn(),
      observable: mockReleasesSubject,
    }

    vi.mocked(getPerspectiveState).mockReturnValue(mockStateSource)
    vi.mocked(getActiveReleasesState).mockReturnValue(mockReleasesStateSource)

    const {result} = renderHook(() => {
      try {
        return usePerspective(perspectiveHandle)
      } catch (e) {
        return e
      }
    })

    // Verify that the hook threw a promise (suspended)
    expect(result.current).toBeInstanceOf(Promise)
    expect(mockStateSource.getCurrent).toHaveBeenCalled()
  })

  it('should resolve with perspective when data is available', () => {
    const mockInstance = {} as SanityInstance
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    const perspectiveHandle: PerspectiveHandle = {
      perspective: 'published',
    }

    const mockPerspective: ClientPerspective = 'published'
    const mockSubject = new BehaviorSubject<ClientPerspective>(mockPerspective)
    const mockStateSource = {
      subscribe: vi.fn((callback) => {
        const subscription = mockSubject.subscribe(callback)
        return () => subscription.unsubscribe()
      }),
      getCurrent: vi.fn(() => mockPerspective),
      observable: mockSubject,
    }

    vi.mocked(getPerspectiveState).mockReturnValue(mockStateSource)

    const {result} = renderHook(() => usePerspective(perspectiveHandle))

    // Verify that the hook returned the perspective without suspending
    expect(result.current).toEqual(mockPerspective)
    expect(mockStateSource.getCurrent).toHaveBeenCalled()
    expect(getPerspectiveState).toHaveBeenCalledWith(mockInstance, perspectiveHandle)
  })
})
