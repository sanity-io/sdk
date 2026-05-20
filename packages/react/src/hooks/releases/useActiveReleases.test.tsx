import {getActiveReleasesState, type ReleaseDocument} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {BehaviorSubject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useActiveReleases} from './useActiveReleases'

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

  it('suspends until the releases state source emits, then resolves with the data', async () => {
    const mockSubject = new BehaviorSubject<ReleaseDocument[] | undefined>(undefined)
    const mockStateSource = {
      subscribe: vi.fn((callback) => {
        const subscription = mockSubject.subscribe(callback)
        return () => subscription.unsubscribe()
      }),
      getCurrent: vi.fn(() => mockSubject.getValue()),
      observable: mockSubject,
    }

    vi.mocked(getActiveReleasesState).mockReturnValue(mockStateSource)

    const {result} = renderHook(
      () => {
        try {
          return useActiveReleases()
        } catch (e) {
          return e
        }
      },
      {
        wrapper: ({children}) => (
          <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
            {children}
          </ResourceProvider>
        ),
      },
    )

    expect(result.current).toBeInstanceOf(Promise)
    expect(mockStateSource.getCurrent).toHaveBeenCalled()

    const resolved: ReleaseDocument[] = [
      {_id: 'release1', _type: 'release'} as unknown as ReleaseDocument,
    ]
    mockSubject.next(resolved)

    await expect(result.current).resolves.toEqual(resolved)
  })

  it('should resolve with releases when data is available', () => {
    const mockReleases: ReleaseDocument[] = [
      {_id: 'release1', _type: 'release'} as unknown as ReleaseDocument,
      {_id: 'release2', _type: 'release'} as unknown as ReleaseDocument,
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

    const {result} = renderHook(() => useActiveReleases(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
          {children}
        </ResourceProvider>
      ),
    })

    // Verify that the hook returned the releases without suspending
    expect(result.current).toEqual(mockReleases)
    expect(mockStateSource.getCurrent).toHaveBeenCalled()
  })
})
