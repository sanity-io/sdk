import {favorites, type FavoriteStatusResponse, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot, installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type FavoriteDocument, type MessageBusHost} from '@sanity/sdk/dashboard'
import {act} from '@testing-library/react'
import {type ReactNode} from 'react'
import {BehaviorSubject, type Subscription} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
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

describe('useFavorite (message bus)', () => {
  const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
  const handle = {documentId: 'doc', documentType: 'movie', resourceType: 'studio' as const}
  // Studios travel as their dataset resource: the test providers' `test.test`.
  const favorite: FavoriteDocument = {
    id: 'doc',
    type: 'movie',
    resource: {id: 'test.test', type: 'dataset'},
  }

  let host: MessageBusHost
  let capabilities: Subscription | undefined
  let published: Subscription | undefined

  // Both replace their previous value on open connections and every connection that opens later.
  const provideFavorites = (provided: boolean) => {
    capabilities?.unsubscribe()
    capabilities = host.connections.subscribe((client) =>
      client.emit('applications.capabilities', provided ? {favorites: true} : {}),
    )
  }
  const publish = (documents: FavoriteDocument[]) => {
    published?.unsubscribe()
    published = host.connections.subscribe((client) =>
      client.emit('favorites.documents', documents),
    )
  }

  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    provideFavorites(true)
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('suspends until the host publishes favorites.documents, then reads it', async () => {
    const {result} = renderHook(() => useFavorite(handle))
    expect(result.current).toBeNull()

    await act(async () => void publish([favorite]))
    expect(result.current).toBe(true)
  })

  it('reads the status from favorites.documents instead of comlink', () => {
    publish([favorite])
    const {result} = renderHook(() => useFavorite(handle))

    expect(result.current).toBe(true)
    expect(favorites.getState).not.toHaveBeenCalled()
  })

  it('follows the host when it republishes', () => {
    publish([favorite])
    const {result} = renderHook(() => useFavorite(handle))

    act(() => void publish([]))
    expect(result.current).toBe(false)
    act(() => void publish([favorite]))
    expect(result.current).toBe(true)
  })

  it('reads favorites once the host starts providing them mid-session', async () => {
    provideFavorites(false)
    const {result} = renderHook(() => useFavorite(handle))
    expect(result.current).toBe(false)

    act(() => void provideFavorites(true))
    await act(async () => void publish([favorite]))
    expect(result.current).toBe(true)
  })

  it('is not favorited when the host provides favorites but never publishes them', async () => {
    // Only the query deadline is faked; React's scheduler keeps real timers so the retry renders.
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    const {result, rerender} = renderHook(() => useFavorite(handle))
    expect(result.current).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(result.current).toBe(false)

    // Like Comlink's cached status, a late publish only shows once the hook renders again.
    await act(async () => void publish([favorite]))
    expect(result.current).toBe(false)
    rerender()
    expect(result.current).toBe(true)
  })
})
