import {
  ChannelError,
  ConnectionFailedError,
  DisconnectError,
  MessageError,
  MessageParseError,
  type SanityClient,
} from '@sanity/client'
import {
  auditTime,
  defer,
  EMPTY,
  filter,
  map,
  mergeMap,
  type Observable,
  of,
  tap,
  throwError,
  timer,
} from 'rxjs'

import {type StateSource} from '../store/createStateSourceAction'
import {retryWithCredential} from './retry'

/** Coalesce mutation bursts without waiting for a quiet period. */
export const QUERY_CHANGE_INTERVAL = 50
/** Best-effort indexing fallback for mutation events delivered before query visibility. */
export const QUERY_INDEXING_DELAY = 1200

const RETRY_MAX_DELAY = 30_000
const RETRY_STABLE_CONNECTION_TIME = 30_000

function isRejected(error: unknown): boolean {
  return (
    error instanceof ConnectionFailedError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  )
}

/**
 * Invalidates fetched results after mutations or connection establishment.
 * This stream deliberately omits patches: document editing has its own listener.
 * Transient connection failures are retried by `@sanity/client`.
 * @internal
 */
export function observeQueryChanges(
  client: SanityClient,
  {
    query = '*',
    tag,
    credential,
  }: {
    query?: string
    tag: string
    credential: Pick<StateSource<unknown>, 'getCurrent' | 'observable'>
  },
): Observable<void> {
  return defer(() => {
    let retryDelay = 1000
    let welcomedAt: number | undefined

    return retryWithCredential(
      defer(() => {
        welcomedAt = undefined
        return client.observable.listen(
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
        )
      }).pipe(
        tap((event) => {
          if (event.type === 'welcome') welcomedAt = performance.now()
          if (event.type === 'reconnect') welcomedAt = undefined
        }),
      ),
      credential,
      (error, _, credentialChanged) => {
        // A rejected listener must not tear down queries that can still serve data.
        // The server stopped this listener: end invalidation without an error.
        if (error instanceof DisconnectError) return EMPTY
        // The server keeps rejecting the same credential. An OAuth client follows its
        // token without being replaced, so reopen once the credential changes.
        if (isRejected(error)) return credentialChanged
        // The client retries transient connection failures. Retry server channel errors
        // and messages here: ChannelError does not distinguish permanent failures,
        // but do not reset the backoff on welcome: a flapping connection emits one on
        // every attempt. Reset only after a connection has stayed open for 30 seconds.
        if (
          !(
            error instanceof ChannelError ||
            error instanceof MessageError ||
            error instanceof MessageParseError
          )
        ) {
          return throwError(() => error)
        }
        if (
          welcomedAt !== undefined &&
          performance.now() - welcomedAt >= RETRY_STABLE_CONNECTION_TIME
        ) {
          retryDelay = 1000
        }
        const delay = retryDelay
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_DELAY)
        return timer(delay)
      },
    ).pipe(
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
  })
}
