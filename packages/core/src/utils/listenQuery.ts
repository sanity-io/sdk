import {type SanityClient} from '@sanity/client'
import {defer, merge, Observable, of, partition, switchMap, throwError} from 'rxjs'
import {debounceTime, filter, mergeMap, share, take} from 'rxjs/operators'

interface ListenEvent {
  type: 'welcome' | 'mutation' | 'reconnect'
  documentId?: string
  transition?: 'update' | 'appear' | 'disappear'
}

type ListenQueryParams = Record<string, string | number | boolean | string[]>

/**
 * Options for configuring a listening query
 * @beta
 */
export interface ListenQueryOptions {
  /** Optional tag for the query for debugging/tracing */
  tag?: string
  /** Time to throttle subsequent fetches after mutations (ms) */
  throttleTime?: number
  /** Filter which mutation transitions to respond to */
  transitions?: ('update' | 'appear' | 'disappear')[]
}

/**
 * Fetches data using the provided query and parameters
 * @internal
 */
const fetch = (
  client: SanityClient,
  query: string,
  params: ListenQueryParams,
  options: ListenQueryOptions,
) =>
  defer(() =>
    client.observable.fetch(query, params, {
      tag: options.tag,
      filterResponse: true,
    }),
  )

/**
 * Sets up a listener for real-time events
 * @internal
 */
const listen = (
  client: SanityClient,
  query: string,
  params: ListenQueryParams,
  options: ListenQueryOptions,
) =>
  defer(() =>
    client.listen(query, params, {
      events: ['welcome', 'mutation', 'reconnect'],
      includeResult: false,
      visibility: 'query',
      tag: options.tag,
    }),
  ) as Observable<ListenEvent>

/**
 * Type guard for welcome events
 * @internal
 */
function isWelcomeEvent(event: ListenEvent): boolean {
  return event.type === 'welcome'
}

/**
 * Be cautious before using this utility.
 *
 * In general, you should reach for `useQueryState` when listening for changes to
 * Sanity documents. This utility is useful for system documents that are currently
 * not supported by `useQueryState`, such as documents of type `system.release`.
 *
 * Creates an observable that listens to a query and emits results when changes occur.
 * @beta
 */
export const listenQuery = <T = unknown>(
  client: SanityClient,
  query: string | {fetch: string; listen: string},
  params: ListenQueryParams = {},
  options: ListenQueryOptions = {},
): Observable<T> => {
  const fetchQuery = typeof query === 'string' ? query : query.fetch
  const listenerQuery = typeof query === 'string' ? query : query.listen

  const fetchOnce$ = fetch(client, fetchQuery, params, options)

  const events$ = listen(client, listenerQuery, params, options).pipe(
    mergeMap((ev, i) => {
      const isFirst = i === 0
      if (isFirst && !isWelcomeEvent(ev)) {
        return throwError(
          () =>
            new Error(
              ev.type === 'reconnect'
                ? 'Could not establish EventSource connection'
                : `Received unexpected type of first event "${ev.type}"`,
            ),
        )
      }
      return of(ev)
    }),
    share(),
  )

  const [welcome$, mutationAndReconnect$] = partition(events$, isWelcomeEvent)
  const isRelevantEvent = (event: ListenEvent): boolean => {
    // If no transitions are specified, or if this is not a mutation event (e.g. reconnect),
    // consider it relevant. For mutation events, we'll check the transition type below.
    if (!options.transitions || event.type !== 'mutation') {
      return true
    }

    return options.transitions.includes(event.transition!)
  }

  return merge(
    welcome$.pipe(take(1)),
    mutationAndReconnect$.pipe(filter(isRelevantEvent), debounceTime(options.throttleTime || 1000)),
  ).pipe(
    // will cancel any in-flight request when a new one comes in
    // but ensures we always get the latest data
    switchMap(() => fetchOnce$),
  )
}
