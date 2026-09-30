import {
  ConnectionFailedError,
  DisconnectError,
  MessageError,
  MessageParseError,
  type SanityClient,
} from '@sanity/client'
import {
  auditTime,
  catchError,
  defer,
  EMPTY,
  filter,
  map,
  mergeMap,
  type Observable,
  of,
  retry,
  throwError,
  timer,
} from 'rxjs'

/** Coalesce mutation bursts without waiting for a quiet period. */
export const QUERY_CHANGE_INTERVAL = 50
/** Best-effort indexing fallback for mutation events delivered before query visibility. */
export const QUERY_INDEXING_DELAY = 1200

/**
 * Invalidates fetched results after mutations or connection establishment.
 * This stream deliberately omits patches: document editing has its own listener.
 * Transient connection failures are retried by `@sanity/client`.
 * @internal
 */
export function observeQueryChanges(
  client: SanityClient,
  {query = '*', tag}: {query?: string; tag: string},
): Observable<void> {
  return defer(() =>
    client.observable.listen(
      query,
      {},
      {
        events: ['welcome', 'mutation', 'reconnect'],
        includeResult: false,
        includeMutations: false,
        includeAllVersions: true,
        visibility: 'query',
        tag,
      },
    ),
  ).pipe(
    // Network failures reconnect inside the client. Server error messages do not.
    // Retry those with capped backoff; malformed requests and rejected credentials
    // must still reach the caller instead of reconnecting indefinitely.
    retry({
      resetOnSuccess: true,
      delay: (error: unknown, attempt) =>
        error instanceof MessageError || error instanceof MessageParseError
          ? timer(Math.min(1000 * 2 ** (attempt - 1), 30_000))
          : throwError(() => error),
    }),
    // A rejected listener must not tear down queries that can still serve data.
    // The enclosing client stream opens a new listener when credentials change.
    catchError((error: unknown) => {
      if (
        error instanceof DisconnectError ||
        (error instanceof ConnectionFailedError &&
          error.status !== undefined &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 408 &&
          error.status !== 429)
      )
        return EMPTY
      return throwError(() => error)
    }),
    // Reconnect means the connection is down. Fetch once it welcomes us again.
    // Keep even the first welcome: mutations between the initial fetch and
    // listener establishment would otherwise be missed.
    filter((event) => event.type !== 'reconnect'),
    // Requesting query visibility is best-effort. Do not let a later, already
    // query-visible event discard the delayed refresh for an earlier mutation.
    mergeMap((event) =>
      event.type === 'mutation' && event.visibility !== 'query'
        ? timer(QUERY_INDEXING_DELAY)
        : of(0),
    ),
    auditTime(QUERY_CHANGE_INTERVAL),
    map(() => undefined),
  )
}
