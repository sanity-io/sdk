import {
  ConnectionFailedError,
  CorsOriginError,
  DisconnectError,
  type LiveEventMessage,
} from '@sanity/client'
import {
  catchError,
  combineLatest,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  type Observable,
  retry,
  skip,
  switchMap,
  take,
} from 'rxjs'

import {getAuthMethodState, getClientAuthState, getTokenState} from '../auth/authStore'
import {type DocumentResource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {getClientState} from './clientStore'

/**
 * All live-events subscriptions must use identical connection options
 * (API version, request tag, `includeDrafts`): `@sanity/client` caches the
 * underlying EventSource per URL + options, so divergent options would
 * silently split what should be a single shared connection.
 */
const LIVE_EVENTS_API_VERSION = 'v2025-05-06'

/**
 * Delay before re-establishing the live events connection after a
 * server-initiated error (e.g. ChannelError, MessageError). Live errors are
 * retried rather than surfaced because an errored live connection would
 * otherwise poison the consuming store. Plain connection drops never reach
 * this — they are reconnected inside `@sanity/client`.
 *
 * @internal
 */
export const LIVE_EVENTS_RETRY_DELAY = 1000

/**
 * Options for {@link observeLiveEvents}.
 * @internal
 */
export interface ObserveLiveEventsOptions {
  /** Resource to scope the underlying client and live connection to. */
  resource?: DocumentResource
  /**
   * Called when the connection fails due to a CORS misconfiguration. The
   * error is swallowed (the stream never errors; it idles) so consumers can
   * surface it as store state instead of a stream error.
   */
  onCorsError: (error: unknown) => void
}

/**
 * Emits Live Content API messages for a dataset so consumers can invalidate
 * fetched data via sync tags.
 *
 * All consumers observe the same underlying EventSource connection:
 * `@sanity/client` caches the live-events stream per URL and connection
 * options, and every subscription made through this function uses the same
 * API version and request tag.
 *
 * @internal
 */
export function observeLiveEvents(
  instance: SanityInstance,
  {resource, onCorsError}: ObserveLiveEventsOptions,
): Observable<LiveEventMessage> {
  // Drafts need a token. Reconnect only when one appears or disappears: the
  // client re-authenticates the stream itself when a token is refreshed.
  const includeDrafts$ = combineLatest([
    getTokenState(instance).observable,
    getAuthMethodState(instance).observable,
  ]).pipe(
    map(([token, authMethod]) => Boolean(token) && authMethod !== 'cookie'),
    distinctUntilChanged(),
  )
  const client$ = getClientState(instance, {
    apiVersion: LIVE_EVENTS_API_VERSION,
    resource,
  }).observable

  const credentialChanged$ = getClientAuthState(instance).observable.pipe(skip(1), take(1))

  return combineLatest([client$, includeDrafts$]).pipe(
    switchMap(([client, includeDrafts]) =>
      defer(() => client.live.events({includeDrafts, tag: 'live-events'})).pipe(
        catchError((error, caught) => {
          if (error instanceof CorsOriginError) {
            // Swallow CORS errors without bubbling up so that they can be
            // handled by the consumer (e.g. shown via the Cors Error component)
            onCorsError(error)
            return EMPTY
          }
          if (error instanceof DisconnectError) {
            // The server explicitly told this client to stop reconnecting —
            // end live updates without erroring (consumers keep serving data,
            // they just stop receiving live invalidation)
            return EMPTY
          }
          if (
            error instanceof ConnectionFailedError &&
            typeof error.status === 'number' &&
            error.status >= 400 &&
            error.status < 500
          ) {
            // The server rejected the connection with a 4xx (e.g. a 401 from
            // an expired token) — it will keep rejecting the same credential,
            // so retrying on a timer would reconnect once per second forever.
            // Reconnect once the credential changes instead. A
            // ConnectionFailedError without a status stays retryable: it may
            // be a transient network failure.
            return credentialChanged$.pipe(switchMap(() => caught))
          }
          throw error
        }),
        // Server-initiated live errors (e.g. ChannelError, MessageError) are
        // retried, not surfaced. Dropped connections are already reconnected
        // inside @sanity/client.
        retry({delay: LIVE_EVENTS_RETRY_DELAY}),
      ),
    ),
    filter((e): e is LiveEventMessage => e.type === 'message'),
  )
}
