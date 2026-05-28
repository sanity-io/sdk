import {getAllReleasesState, type ReleaseDocument} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {BehaviorSubject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useAllReleases} from './useAllReleases'

vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    getAllReleasesState: vi.fn(),
  }
})

describe('useAllReleases', () => {
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

    vi.mocked(getAllReleasesState).mockReturnValue(mockStateSource)

    const {result} = renderHook(
      () => {
        try {
          return useAllReleases()
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
      {_id: 'r-active', _type: 'system.release', state: 'active'} as ReleaseDocument,
    ]
    mockSubject.next(resolved)

    await expect(result.current).resolves.toEqual(resolved)
  })

  it('returns every release including archived and published once loaded', () => {
    const mockReleases: ReleaseDocument[] = [
      {_id: 'r-active', _type: 'system.release', state: 'active'} as ReleaseDocument,
      {_id: 'r-archived', _type: 'system.release', state: 'archived'} as ReleaseDocument,
      {_id: 'r-published', _type: 'system.release', state: 'published'} as ReleaseDocument,
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

    vi.mocked(getAllReleasesState).mockReturnValue(mockStateSource)

    const {result} = renderHook(() => useAllReleases(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
          {children}
        </ResourceProvider>
      ),
    })

    expect(result.current).toEqual(mockReleases)
    expect(mockStateSource.getCurrent).toHaveBeenCalled()
  })
})
