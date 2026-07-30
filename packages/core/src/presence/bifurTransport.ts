import {type BifurClient, fromUrl} from '@sanity/bifur-client'
import {type SanityClient} from '@sanity/client'
import {defer, EMPTY, fromEvent, merge, type Observable, timer} from 'rxjs'
import {catchError, distinctUntilChanged, map, retry, share, switchMap} from 'rxjs/operators'

import {
  type BifurTransportOptions,
  type PresenceLocation,
  type PresenceTransport,
  type TransportEvent,
  type TransportMessage,
} from './types'

/**
 * Longest gap between reconnection attempts, matching the Studio's presence
 * transport so both behave the same way on a flaky connection.
 */
const CONNECT_RETRY_MAX_DELAY = 1000 * 240

type BifurStateMessage = {
  type: 'state'
  i: string
  m: {
    sessionId: string
    locations: PresenceLocation[]
  }
}

type BifurDisconnectMessage = {
  type: 'disconnect'
  i: string
  m: {session: string}
}

type RollCallEvent = {
  type: 'rollCall'
  i: string
  session: string
}

type IncomingBifurEvent = RollCallEvent | BifurStateMessage | BifurDisconnectMessage

function getBifurClient(client: SanityClient, token$: Observable<string | null>): BifurClient {
  const bifurVersionedClient = client.withConfig({apiVersion: '2022-06-30'})
  const {
    resource,
    dataset,
    url: baseUrl,
    requestTagPrefix = 'sanity.sdk.presence',
  } = bifurVersionedClient.config()

  let resourcePath: string
  if (resource?.type === 'canvas') {
    resourcePath = `canvases/${resource.id}`
  } else if (dataset) {
    // Dataset clients use project hostname — dataset name alone is the socket path
    resourcePath = dataset
  } else {
    throw new Error(`Unable to determine presence URL: no canvas resource or dataset configured`)
  }

  const url = `${baseUrl}/socket/${resourcePath}`.replace(/^http/, 'ws')

  const urlWithTag = `${url}?tag=${requestTagPrefix}`

  return fromUrl(urlWithTag, {token$})
}

const handleIncomingMessage = (event: IncomingBifurEvent): TransportEvent => {
  switch (event.type) {
    case 'rollCall':
      return {
        type: 'rollCall',
        userId: event.i,
        sessionId: event.session,
      }
    case 'state': {
      const {sessionId, locations} = event.m
      return {
        type: 'state',
        userId: event.i,
        sessionId,
        timestamp: new Date().toISOString(),
        locations,
      }
    }
    case 'disconnect':
      return {
        type: 'disconnect',
        userId: event.i,
        sessionId: event.m.session,
        timestamp: new Date().toISOString(),
      }
    default: {
      throw new Error(`Got unknown presence event: ${JSON.stringify(event)}`)
    }
  }
}

/**
 * Emits an incrementing generation number each time the socket becomes live.
 *
 * `@sanity/bifur-client` does not reconnect on its own — it errors the stream
 * when the socket closes. Without the `retry` below, presence stops for the
 * life of the page after the first dropped connection.
 */
const createConnections = (bifur: BifurClient): Observable<number> => {
  let generation = 0

  return defer(() => {
    const current = ++generation
    // `heartbeats` emits as soon as the socket is open and authorized, then on
    // every server heartbeat and every response. Subscribing to it is also what
    // keeps the socket alive between requests.
    return bifur.heartbeats.pipe(map(() => current))
  }).pipe(
    retry({
      delay: (_error, retryCount) =>
        timer(Math.min(CONNECT_RETRY_MAX_DELAY, 2 ** retryCount * 100)),
      resetOnSuccess: true,
    }),
    // After `retry` so that one operator instance spans reconnects, making each
    // live socket yield exactly one emission.
    distinctUntilChanged(),
    share(),
  )
}

/**
 * Presence events from everyone else in the room, re-established on every live
 * connection.
 *
 * A socket close errors this stream just as it errors the heartbeats, so without
 * re-subscribing the client would keep announcing itself after a reconnect while
 * never hearing from anyone again. Driving it from `connections$` rather than
 * giving it its own `retry` keeps a single reconnect loop, instead of two
 * independent backoffs racing over one refcounted socket.
 */
const createIncomingEvents = (
  bifur: BifurClient,
  connections$: Observable<number>,
): Observable<TransportEvent> =>
  connections$.pipe(
    switchMap(() =>
      bifur.listen<IncomingBifurEvent>('presence').pipe(
        // Let a dead listener go quietly. The next connection replaces it, and
        // surfacing the error here would tear down the reconnect loop with it.
        catchError(() => EMPTY),
      ),
    ),
    map(handleIncomingMessage),
    share(),
  )

/**
 * Emits when the page is going away. `pagehide` is needed alongside
 * `beforeunload` because iOS Safari and pages entering the back/forward cache
 * never fire `beforeunload`.
 */
const createUnload = (): Observable<void> => {
  if (typeof window === 'undefined') return EMPTY

  return merge(fromEvent(window, 'beforeunload'), fromEvent(window, 'pagehide')).pipe(
    map(() => undefined),
  )
}

export const createBifurTransport = (options: BifurTransportOptions): PresenceTransport => {
  const {client, token$, sessionId} = options
  const bifur = getBifurClient(client, token$)

  const connections$ = createConnections(bifur)
  const incomingEvents$ = createIncomingEvents(bifur, connections$)

  const dispatchMessage = (message: TransportMessage): Observable<void> => {
    switch (message.type) {
      case 'rollCall':
        return bifur.request('presence_rollcall', {session: sessionId})
      case 'state':
        return bifur.request('presence_announce', {
          data: {locations: message.locations, sessionId},
        })
      case 'disconnect':
        return bifur.request('presence_disconnect', {session: sessionId})
      default: {
        return EMPTY
      }
    }
  }

  return [incomingEvents$, dispatchMessage, connections$, createUnload()]
}
