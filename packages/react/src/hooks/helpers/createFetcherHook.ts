import {type Fetcher, type FetcherSnapshot, isDeepEqual} from '@sanity/sdk/_internal'
import {useRef, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * The value returned by a fetcher-backed hook. The hook suspends until the
 * first fetch succeeds, so `data` is always present once your component renders.
 *
 * @public
 */
export interface FetcherHookResult<TData> {
  /** The resolved data. Guaranteed present — the hook suspends until the first fetch succeeds. */
  data: TData
  /** A fetch for this entry is in flight (background revalidation or a `refetch()`). */
  isFetching: boolean
  /** The most recent background-fetch failure while data still renders; cleared by the next success. */
  error: unknown
  /** Imperatively refetch, bypassing staleness. Resolves with the refreshed data. */
  refetch: () => Promise<TData>
}

/**
 * Builds a Suspense hook over a {@link Fetcher}: it suspends until the first
 * success via the snapshot's `status`, throws the error arm to the nearest error
 * boundary, and returns the live `{data, isFetching, error, refetch}` envelope.
 *
 * @internal
 */
export function createFetcherHook<TParams extends unknown[], TData>(
  fetcher: Fetcher<TParams, TData>,
): (...params: TParams) => FetcherHookResult<TData> {
  return function useFetcherHook(...params: TParams): FetcherHookResult<TData> {
    const instance = useSanityInstance()
    const source = fetcher.getState(instance, ...params)

    // No entry/data yet — suspend on the first fetch (matches an 'error' below never reaching here).
    if (source.getCurrent().status === 'pending') {
      throw fetcher.resolveState(instance, ...params)
    }

    // The store replaces its cache entry on every (un)subscribe (it bumps a
    // subscription counter), so `getCurrent()` hands back a fresh snapshot object
    // with identical fields on each commit. Passed raw to `useSyncExternalStore`
    // — which compares by `Object.is` — that reads as a perpetual change and
    // re-renders forever. Reuse the previous snapshot while its fields are
    // unchanged so React sees a stable reference.
    const previous = useRef<FetcherSnapshot<TData> | null>(null)
    const snapshot = useSyncExternalStore(source.subscribe, () => {
      const next = source.getCurrent()
      const prev = previous.current
      if (prev && isDeepEqual(prev, next)) return prev
      previous.current = next
      return next
    })

    if (snapshot.status !== 'success') {
      // 'pending' already suspended above; 'error' surfaces to the error boundary.
      throw snapshot.status === 'error' ? snapshot.error : fetcher.resolveState(instance, ...params)
    }

    return {
      data: snapshot.data,
      isFetching: snapshot.isFetching,
      error: snapshot.error,
      refetch: () => fetcher.refetch(instance, ...params),
    }
  }
}
