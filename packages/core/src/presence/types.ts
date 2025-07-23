import {type SanityClient} from '@sanity/client'
import {type Observable} from 'rxjs'

/** @public */
export interface PresenceLocation {
  type: 'document'
  documentId: string
  path: string[]
  lastActiveAt: string
}

/** @public */
export type PresenceTransport = [
  incomingEvents$: Observable<TransportEvent>,
  dispatchMessage: (message: TransportMessage) => Observable<void>,
]

/** @public */
export type TransportEvent = RollCallEvent | StateEvent | DisconnectEvent

/** @public */
export interface RollCallEvent {
  type: 'rollCall'
  userId: string
  sessionId: string
}

/** @public */
export interface StateEvent {
  type: 'state'
  userId: string
  sessionId: string
  timestamp: string
  locations: PresenceLocation[]
}

/** @public */
export interface DisconnectEvent {
  type: 'disconnect'
  userId: string
  sessionId: string
  timestamp: string
}

/** @public */
export type TransportMessage =
  | {type: 'rollCall'}
  | {type: 'state'; locations: PresenceLocation[]}
  | {type: 'disconnect'}

/** @public */
export interface BifurTransportOptions {
  client: SanityClient
  token$: Observable<string | null>
  sessionId: string
}

/** @public */
export interface PresenceStore {
  locations$: Observable<PresenceLocation[]>
  reportPresence: (locations: PresenceLocation[]) => void
}
