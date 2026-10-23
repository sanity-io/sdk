import {type ReleaseDocument} from '@sanity/client'
import {catchError, defer, EMPTY, map, type Observable, startWith, switchMap, tap} from 'rxjs'
import {exhaustMapWithTrailing} from 'rxjs-exhaustmap-with-trailing'

import {getClientState} from '../client/clientStore'
import {observeQueryChanges} from '../client/observeQueryChanges'
import {type DocumentResource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'

const RELEASES_QUERY = 'releases::all()'
const RELEASES_LISTEN_QUERY = '*[_type == "system.release" && _id in path("_.releases.*")]'
const RELEASES_API_VERSION = 'v2025-05-06'

/** @internal */
export interface ObserveReleasesOptions {
  resource?: DocumentResource
  /** Reports failures without ending the client or mutation subscriptions. */
  onError: (error: unknown) => void
}

/**
 * Observes all release metadata, including archived and published releases.
 * Fetches directly because release data is itself an input to query perspective
 * resolution. Using the query store here would create a dependency cycle.
 * @internal
 */
export function observeReleases(
  instance: SanityInstance,
  {resource, onError}: ObserveReleasesOptions,
): Observable<ReleaseDocument[] | undefined> {
  return getClientState(instance, {apiVersion: RELEASES_API_VERSION, resource}).observable.pipe(
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
            catchError((error: unknown) => {
              if (!hasCurrentResult) onError(error)
              return EMPTY
            }),
          ),
        ),
      )
    }),
  )
}
