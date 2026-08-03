import {type SanityClient} from '@sanity/client'
import {type Path} from '@sanity/types'
import {type Observable} from 'rxjs'

import {type SanityUser} from '../users/types'

/**
 * One end of a text selection: a Portable Text path plus a character offset
 * within the span it addresses.
 * @public
 */
export interface PresenceSelectionPoint {
  path: Path
  offset: number
}

/**
 * A Portable Text caret or selected range, as exchanged with the Studio.
 *
 * Structurally identical to `EditorSelection` from `@portabletext/editor`, and
 * declared here rather than imported so that `@sanity/sdk` stays free of React
 * dependencies. The two are asserted to be mutually assignable in the React
 * package, where the editor is already a peer dependency.
 * @public
 */
export type PresenceSelection = {
  anchor: PresenceSelectionPoint
  focus: PresenceSelectionPoint
  backward?: boolean
} | null

/** @public */
export interface PresenceLocation {
  type: 'document'
  documentId: string
  /**
   * The focused field path.
   *
   * Note that this under-describes what actually arrives: path segments may be
   * keyed (`{_key}`) or numeric when the focus is inside an array or a Portable
   * Text field, because that is what the Studio sends. Narrowing to `string[]`
   * predates that discovery, and widening it to `Path` is a breaking change to a
   * published type, so it is deferred to the next major. Use
   * {@link ReportPresenceOptions.path} when reporting, which is typed correctly.
   */
  path: string[]
  lastActiveAt: string
  /** A Portable Text caret, when the focused field is a Portable Text field. */
  selection?: PresenceSelection
}

/**
 * A location as it travels over the wire. Identical in shape to
 * {@link PresenceLocation}, except `path` is a full `Path`, which is what is
 * really exchanged. See the note on {@link PresenceLocation.path}.
 *
 * Internal: nothing in the public API accepts or returns this. Apps describe
 * where they are with {@link ReportPresenceOptions} and read presence as
 * {@link PresenceLocation}.
 * @internal
 */
export interface WirePresenceLocation extends Omit<PresenceLocation, 'path'> {
  path: Path
}

/**
 * What an app reports about where the current user is.
 *
 * Omit `path` for document-level presence, or pass one for field-level presence.
 * @public
 */
export interface ReportPresenceOptions {
  /**
   * The specific document id the user is in: a draft, published, or version id,
   * whichever matches the perspective they are editing.
   */
  documentId: string
  /**
   * The focused field path. Supports keyed and numeric segments, so array items
   * and Portable Text spans can be addressed.
   */
  path?: Path
  /** A Portable Text caret, when the focused field is a Portable Text field. */
  selection?: PresenceSelection
}

/** @public */
export interface UserPresence {
  user: SanityUser
  locations: PresenceLocation[]
  sessionId: string
}

/** @public */
export type PresenceTransport = [
  incomingEvents$: Observable<TransportEvent>,
  dispatchMessage: (message: TransportMessage) => Observable<void>,
  /**
   * Emits an incrementing generation number each time the connection becomes
   * live. Reconnects with backoff, and subscribing keeps the connection alive.
   */
  connections$: Observable<number>,
  /** Emits when the page is going away, so a disconnect can be announced. */
  unload$: Observable<void>,
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
  | {type: 'state'; locations: WirePresenceLocation[]}
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
}
