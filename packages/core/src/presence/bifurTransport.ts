import {type BifurClient, fromUrl} from '@sanity/bifur-client'
import {type SanityClient} from '@sanity/client'
import {EMPTY, fromEvent, type Observable} from 'rxjs'
import {map, share, switchMap} from 'rxjs/operators'

import {
  type BifurTransportOptions,
  type PresenceLocation,
  type PresenceTransport,
  type TransportEvent,
  type TransportMessage,
} from './types'

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
  const {dataset, url: baseUrl, requestTagPrefix = 'sanity.studio'} = bifurVersionedClient.config()
  const url = `${baseUrl.replace(/\/+$/, '')}/socket/${dataset}`.replace(/^http/, 'ws')
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

export const createBifurTransport = (options: BifurTransportOptions): PresenceTransport => {
  const {client, token$, sessionId} = options
  const bifur = getBifurClient(client, token$)

  const incomingEvents$: Observable<TransportEvent> = bifur
    .listen<IncomingBifurEvent>('presence')
    .pipe(map(handleIncomingMessage))

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

  if (typeof window !== 'undefined') {
    fromEvent(window, 'beforeunload')
      .pipe(switchMap(() => dispatchMessage({type: 'disconnect'})))
      .subscribe()
  }

  return [incomingEvents$.pipe(share()), dispatchMessage]
}
