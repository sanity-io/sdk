import {type ReleaseDocument} from '@sanity/client'
import {catchError, defer, EMPTY, map, type Observable, startWith, switchMap, tap} from 'rxjs'
import {exhaustMapWithTrailing} from 'rxjs-exhaustmap-with-trailing'

import {getClientState} from '../client/clientStore'
import {observeQueryChanges} from '../client/observeQueryChanges'
import {retryRead} from '../client/retry'
import {type DocumentResource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'

const RELEASES_QUERY = 'releases::all()'
const RELEASES_LISTEN_QUERY = '*[_type == "system.release" && _id in path("_.releases.*")]'
const RELEASES_API_VERSION = 'v2025-05-06'

/** @internal */
export interface ObserveReleasesOptions {
  resource?: DocumentResource
  /** Reports a listener failure without ending the client subscription. */
  onError: (error: unknown) => void
  /**
   * Receives a failed fetch, and `undefined` once a retry with the same client succeeds.
   * A new client starts a fresh retry, so its first emission is the recovery signal.
   */
  onFetchError: (error: unknown) => void
}

/**
 * Observes all release metadata, including archived and published releases.
 * Fetches directly because release data is itself an input to query perspective
 * resolution. Using the query store here would create a dependency cycle.
 * @internal
 */
export function observeReleases(
  instance: SanityInstance,
  {resource, onError, onFetchError}: ObserveReleasesOptions,
): Observable<ReleaseDocument[] | undefined> {
  const client$ = getClientState(instance, {apiVersion: RELEASES_API_VERSION, resource}).observable

  return client$.pipe(
    // A new client, such as after a token change, refetches releases.
    switchMap((client) => {
      let hasCurrentResult = false
      return observeQueryChanges(client, {
        query: RELEASES_LISTEN_QUERY,
        tag: 'releases.listen',
      }).pipe(
        // Completing the listener must allow an in-flight fetch to finish.
        catchError((error: unknown) => {
          onError(error)
          return EMPTY
        }),
        startWith(undefined),
        exhaustMapWithTrailing(() =>
          defer(() =>
            client.observable.fetch<ReleaseDocument[]>(
              RELEASES_QUERY,
              {},
              {
                perspective: 'raw',
                useCdn: false,
                filterResponse: false,
                returnQuery: false,
                tag: 'releases',
              },
            ),
          ).pipe(
            map((response) => response.result),
            tap(() => {
              hasCurrentResult = true
            }),
            // A failed refresh must not end the listener, so it retries under the shared
            // read policy. Keep releases fetched with this client instead of an error.
            retryRead(client$, (error) => {
              if (error !== undefined && hasCurrentResult) return
              onFetchError(error)
            }),
          ),
        ),
      )
    }),
  )
}
