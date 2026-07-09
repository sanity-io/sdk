import {type ReleaseDocument, type SyncTag} from '@sanity/client'
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  type Observable,
  startWith,
  switchMap,
  tap,
} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {observeLiveEvents} from '../client/liveEvents'
import {type DocumentResource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'

const RELEASES_QUERY = 'releases::all()'
const RELEASES_API_VERSION = 'v2025-05-06'

/**
 * Options for {@link observeReleases}.
 * @internal
 */
export interface ObserveReleasesOptions {
  /** Resource to scope the underlying client and live connection to. */
  resource?: DocumentResource
  /**
   * Called when the live events connection fails due to a CORS
   * misconfiguration. See `observeLiveEvents`.
   */
  onCorsError: (error: unknown) => void
}

/**
 * Emits every release document (including archived and published), refetching
 * whenever a Live Content API event matches the query's sync tags.
 *
 * This fetches directly through the client store — deliberately not via the
 * query store — because release data is itself an input to query perspective
 * resolution (`getPerspectiveState`); fetching through the query store would
 * make the two stores mutually dependent.
 *
 * @internal
 */
export function observeReleases(
  instance: SanityInstance,
  {resource, onCorsError}: ObserveReleasesOptions,
): Observable<ReleaseDocument[] | undefined> {
  const client$ = getClientState(instance, {
    apiVersion: RELEASES_API_VERSION,
    resource,
  }).observable

  return client$.pipe(
    switchMap((client) => {
      const syncTags$ = new BehaviorSubject<SyncTag[] | undefined>(undefined)

      // Pair the latest live message with the latest known sync tags so that
      // a message arriving while a fetch is still in flight is re-evaluated
      // (and refetched if it matches) once that fetch's tags land — instead
      // of being dropped and leaving the store stale until the next event.
      const refetchEventId$ = combineLatest([
        observeLiveEvents(instance, {resource, onCorsError}).pipe(startWith(undefined)),
        syncTags$,
      ]).pipe(
        filter(
          ([message, syncTags]) =>
            message === undefined || message.tags.some((tag) => syncTags?.includes(tag)),
        ),
        map(([message]) => message?.id),
        distinctUntilChanged(),
      )

      return refetchEventId$.pipe(
        switchMap((lastLiveEventId) =>
          client.observable.fetch<ReleaseDocument[]>(
            RELEASES_QUERY,
            {},
            {
              perspective: 'raw',
              filterResponse: false,
              returnQuery: false,
              lastLiveEventId,
              tag: 'releases',
            },
          ),
        ),
        tap((response) => {
          syncTags$.next(response.syncTags)
        }),
        map((response) => response.result),
      )
    }),
    // Emit synchronously on subscribe (mirroring StateSource semantics, which
    // the releases store previously consumed) so the store can immediately
    // record an empty list: consumers distinguish "no releases yet" from
    // "never loaded", and the React hooks don't suspend on first load.
    startWith(undefined),
  )
}
