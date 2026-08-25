import {favorites, type FavoriteStatusResponse, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {renderHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {BehaviorSubject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useFavorite} from './useFavorite'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    favorites: {
      getState: vi.fn(),
      resolveState: vi.fn(),
      refetch: vi.fn(),
    },
  } as unknown as typeof actual
})

describe('useFavorite', () => {
  let subject: BehaviorSubject<FavoriteStatusResponse>

  const handle = {
    documentId: 'mock-id',
    documentType: 'mock-type',
    resourceType: 'studio' as const,
  }

  const toSnapshot = (value: FavoriteStatusResponse): FetcherSnapshot<FavoriteStatusResponse> => ({
    status: 'success',
    data: value,
    error: undefined,
    isFetching: false,
    dataUpdatedAt: 1,
  })

  const wrapper = ({children}: {children: ReactNode}) => (
    <ResourceProvider projectId="test" dataset="test" fallback={null}>
      {children}
    </ResourceProvider>
  )

  beforeEach(() => {
    subject = new BehaviorSubject<FavoriteStatusResponse>({isFavorited: false})
    vi.mocked(favorites.getState).mockImplementation(
      () =>
        ({
          subscribe: (callback?: () => void) => {
            if (!callback) return () => {}
            const subscription = subject.subscribe(() => callback())
            callback()
            return () => subscription.unsubscribe()
          },
          getCurrent: () => toSnapshot(subject.getValue()),
          observable: subject.asObservable(),
        }) as unknown as StateSource<FetcherSnapshot<FavoriteStatusResponse>>,
    )
  })

  afterEach(() => {
    subject.complete()
    vi.clearAllMocks()
  })

  it('returns false when the document is not favorited', () => {
    const {result} = renderHook(() => useFavorite(handle), {wrapper})
    expect(result.current).toBe(false)
  })

  it('reflects the favorited status from the store', () => {
    subject.next({isFavorited: true})
    const {result} = renderHook(() => useFavorite(handle), {wrapper})
    expect(result.current).toBe(true)
  })

  it('suspends until the favorite status is available', () => {
    const pending: FetcherSnapshot<FavoriteStatusResponse> = {
      status: 'pending',
      data: undefined,
      error: undefined,
      isFetching: true,
      dataUpdatedAt: undefined,
    }
    vi.mocked(favorites.getState).mockImplementation(
      () =>
        ({
          subscribe: () => () => {},
          getCurrent: () => pending,
          observable: subject.asObservable(),
        }) as unknown as StateSource<FetcherSnapshot<FavoriteStatusResponse>>,
    )
    vi.mocked(favorites.resolveState).mockReturnValue(new Promise(() => {}))
    const {result} = renderHook(() => useFavorite(handle), {wrapper})
    // Suspended on the initial fetch — the ResourceProvider fallback renders instead.
    expect(result.current).toBeNull()
    expect(favorites.resolveState).toHaveBeenCalled()
  })
})
