import {createSanityInstance} from '@sanity/sdk'
import {defineFetcher, type Fetcher, type FetcherSnapshot} from '@sanity/sdk/_internal'
import {renderHook} from '@testing-library/react'
import {of, throwError} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {createFetcherHook} from './createFetcherHook'

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

const makeFetcher = (snapshot: FetcherSnapshot<string>): Fetcher<[id: string], string> => {
  const fetcher = {
    getState: vi.fn(() => ({
      subscribe: vi.fn(() => () => {}),
      getCurrent: () => snapshot,
      observable: throwError(() => new Error('unexpected usage of observable')),
    })),
    resolveState: vi.fn(() => Promise.resolve('resolved')),
    refetch: vi.fn(() => Promise.resolve('refetched')),
    invalidate: vi.fn(),
    invalidateAll: vi.fn(),
    setData: vi.fn(() => ({undo: vi.fn()})),
  }
  return fetcher as unknown as Fetcher<[id: string], string>
}

const success: FetcherSnapshot<string> = {
  status: 'success',
  data: 'DATA',
  error: undefined,
  isFetching: false,
  dataUpdatedAt: 1,
}

describe('createFetcherHook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSanityInstance).mockReturnValue(instance)
  })

  it('returns {data, isFetching, error, refetch} from a success snapshot', () => {
    const fetcher = makeFetcher(success)
    const useThing = createFetcherHook(fetcher)
    const {result} = renderHook(() => useThing('a'))

    expect(result.current.data).toBe('DATA')
    expect(result.current.isFetching).toBe(false)
    expect(result.current.error).toBeUndefined()
    expect(typeof result.current.refetch).toBe('function')
  })

  it('surfaces isFetching and the background error on the success arm', () => {
    const boom = new Error('background')
    const fetcher = makeFetcher({...success, isFetching: true, error: boom})
    const useThing = createFetcherHook(fetcher)
    const {result} = renderHook(() => useThing('a'))

    expect(result.current.isFetching).toBe(true)
    expect(result.current.error).toBe(boom)
  })

  it('refetch() calls the fetcher with the instance and params', () => {
    const fetcher = makeFetcher(success)
    const useThing = createFetcherHook(fetcher)
    const {result} = renderHook(() => useThing('a'))

    const returned = result.current.refetch()

    expect(fetcher.refetch).toHaveBeenCalledWith(instance, 'a')
    expect(returned).toBeInstanceOf(Promise)
  })

  it('suspends on a pending snapshot by throwing resolveState', () => {
    const fetcher = makeFetcher({
      status: 'pending',
      data: undefined,
      error: undefined,
      isFetching: true,
      dataUpdatedAt: undefined,
    })
    const useThing = createFetcherHook(fetcher)
    const {result} = renderHook(() => {
      try {
        return useThing('a')
      } catch (thrown) {
        return thrown
      }
    })

    expect(fetcher.resolveState).toHaveBeenCalledWith(instance, 'a')
    expect(result.current).toBe(vi.mocked(fetcher.resolveState).mock.results[0]!.value)
  })

  it('throws the error arm to the error boundary', () => {
    const boom = new Error('fatal')
    const fetcher = makeFetcher({
      status: 'error',
      data: undefined,
      error: boom,
      isFetching: false,
      dataUpdatedAt: undefined,
    })
    const useThing = createFetcherHook(fetcher)
    const {result} = renderHook(() => {
      try {
        return useThing('a')
      } catch (thrown) {
        return thrown
      }
    })

    expect(result.current).toBe(boom)
  })

  // Regression: the mocked fetcher above can never reproduce the real bug — its
  // `getCurrent` returns a fixed snapshot object. A real fetcher store replaces
  // the cache entry on every (un)subscribe, so `getCurrent` yields a new snapshot
  // reference each time. Feeding that straight through `useSyncExternalStore`
  // makes React see the store "change" on every commit and re-render forever
  // ("Maximum update depth exceeded", React #185).
  it('does not re-render forever over a real fetcher store (SDK-1448)', () => {
    const fetcher = defineFetcher<[id: string], string>({
      name: `regression-loop-${Math.random().toString(36).slice(2)}`,
      getKey: (_instance, id) => id,
      fetch: () => (id) => of(`DATA:${id}`),
    })
    // Seed a success entry so we skip Suspense and land in useSyncExternalStore.
    fetcher.setData(instance, ['a'], 'DATA:a')

    const useThing = createFetcherHook(fetcher)

    let renders = 0
    const {result} = renderHook(() => {
      renders += 1
      if (renders > 25) throw new Error(`infinite render loop: ${renders} renders`)
      return useThing('a')
    })

    expect(result.current.data).toBe('DATA:a')
    expect(renders).toBeLessThan(25)
  })

  // The realistic case: `data` is an object, not a primitive. The store hands
  // back a fresh snapshot object on every (un)subscribe, so the dedup must keep
  // returning the *same* `data` reference while the entry is unchanged —
  // otherwise consumers that key off `data` identity (memo deps, effects)
  // re-render on every commit even though nothing changed. This is the property
  // the snapshot-equality check guards.
  it('keeps a stable object data reference across re-renders (SDK-1448)', () => {
    const data = {id: 'a', title: 'Thing', tags: ['x', 'y']}
    const fetcher = defineFetcher<[id: string], typeof data>({
      name: `regression-object-${Math.random().toString(36).slice(2)}`,
      getKey: (_instance, id) => id,
      fetch: () => () => of(data),
    })
    fetcher.setData(instance, ['a'], data)

    const useThing = createFetcherHook(fetcher)

    let renders = 0
    const seen: unknown[] = []
    const {result} = renderHook(() => {
      renders += 1
      if (renders > 25) throw new Error(`infinite render loop: ${renders} renders`)
      const value = useThing('a')
      seen.push(value.data)
      return value
    })

    expect(result.current.data).toBe(data)
    expect(renders).toBeLessThan(25)
    // Every commit observed the identical object — no churn from fresh snapshots.
    expect(seen.every((d) => d === data)).toBe(true)
  })
})
