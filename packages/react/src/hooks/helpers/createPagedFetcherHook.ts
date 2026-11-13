import {type CursorPage, type PagedFetcher} from '@sanity/sdk/_internal'
import {useCallback, useLayoutEffect, useMemo, useRef, useTransition} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {createFetcherHook, type FetcherHookResult} from './createFetcherHook'
import {withSdkOrigin} from './withSdkOrigin'

/**
 * The value returned by a hook that reads a list a page at a time, like `useApplications`. `data`
 * is one page holding every item read so far, in order, with the last page's `nextCursor`.
 *
 * @public
 * @category Types
 * @category Platform
 */
export interface PagedFetcherHookResult<TPage> extends FetcherHookResult<TPage> {
  /** Whether there's another page to read. */
  hasMore: boolean
  /** Whether the next page is being read. */
  isPending: boolean
  /** Reads the next page. A failure shows on `error`, keeping the items read so far. */
  loadMore: () => void
}

const joinPages = <TPage extends CursorPage>(pages: TPage[]): TPage => ({
  ...pages[pages.length - 1]!,
  data: pages.flatMap((page) => page.data),
})

/**
 * Builds a Suspense hook over a {@link PagedFetcher}, like {@link createFetcherHook}, that
 * returns every item read so far and reads the next page with `loadMore`.
 *
 * @internal
 */
export function createPagedFetcherHook<TParams extends unknown[], TPage extends CursorPage>(
  fetcher: PagedFetcher<TParams, TPage>,
): (...params: TParams) => PagedFetcherHookResult<TPage> {
  const useFetcher = createFetcherHook(fetcher)
  return withSdkOrigin(function usePagedFetcher(...params: TParams): PagedFetcherHookResult<TPage> {
    const instance = useSanityInstance()
    const {data: pages, refetch, ...result} = useFetcher(...params)
    const [isPending, startTransition] = useTransition()
    const data = useMemo(() => joinPages(pages), [pages])
    // The latest params, so `loadMore` stays one function and an effect that calls it runs once
    const latestParams = useRef(params)
    useLayoutEffect(() => {
      latestParams.current = params
    })
    // The failure is on the entry's `error`, so it doesn't reach an error boundary
    const loadMore = useCallback(
      () =>
        startTransition(() =>
          fetcher.loadMore(instance, ...latestParams.current).then(
            () => {},
            () => {},
          ),
        ),
      [instance],
    )
    return {
      ...result,
      data,
      hasMore: data.nextCursor !== null,
      isPending,
      loadMore,
      refetch: () => refetch().then(joinPages),
    }
  })
}
