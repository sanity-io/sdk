import {type SanityClient} from '@sanity/client'
import {type Path} from '@sanity/types'
import {type Observable} from 'rxjs'

import {type PerspectiveHandle} from '../config/sanityConfig'
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
 * declared separately so that `@sanity/sdk` stays free of React dependencies. A
 * value from the editor can be passed straight through, and vice versa.
 *
 * `offset` is a character offset within the span that `path` addresses.
 * @public
 */
export type PresenceSelection = {
  anchor: PresenceSelectionPoint
  focus: PresenceSelectionPoint
  backward?: boolean
} | null

/**
 * Somewhere a participant is, as it arrives over the wire.
 *
 * Prefer {@link DocumentPresence} from `getDocumentPresence`, which is scoped to one
 * document, flattened for rendering, and types `path` accurately.
 * @public
 */
export interface PresenceLocation {
  type: 'document'
  /**
   * The specific document the participant is in, so a draft, published, or version
   * id rather than a bare document id.
   */
  documentId: string
  /**
   * The focused field path, empty when they are in the document but not a field.
   *
   * Declared as `string[]`, but segments can also be numbers or `{_key: string}`
   * objects when the focus is inside an array or a Portable Text field, because
   * that is what other clients send. Guard for those rather than assuming strings.
   * Widening the declared type is a breaking change, so it waits for the next major;
   * {@link DocumentPresence.path} is typed correctly today.
   */
  path: string[]
  /**
   * When the participant said they were last active, on *their* clock.
   *
   * Fine for display, unreliable for deciding whether someone is still here: it is
   * subject to clock skew between machines. Presence already drops participants that
   * stop announcing, so a session appearing here is one the SDK still considers
   * live.
   */
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
 * Which specific document a presence id resolves to.
 *
 * Presence compares exact document ids, so a client in a draft and a client in the
 * published document are in different places even for the same `documentId`. Pass
 * the perspective you are editing under and the SDK resolves it; the React hooks
 * take it from `ResourceProvider` when you do not pass one.
 * @public
 */
export interface PresencePerspectiveOptions extends PerspectiveHandle {
  /** Live-edit documents have no draft, so presence resolves to the published id. */
  liveEdit?: boolean
}

/**
 * What an app reports about where the current user is.
 *
 * Omit `path` for document-level presence, or pass one for field-level presence.
 * @public
 */
export interface ReportPresenceOptions extends PresencePerspectiveOptions {
  /**
   * The document the user is in.
   *
   * Pass the plain document id; the perspective decides which specific document that
   * resolves to. An already-specific id is accepted and re-resolved, so passing
   * `drafts.abc` while the perspective is `published` reports the published document.
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

/**
 * One participant's session and everywhere it currently is.
 *
 * Keyed by session, not by user: the same person in two tabs is two entries with
 * the same `user`.
 * @public
 */
export interface UserPresence {
  user: SanityUser
  locations: PresenceLocation[]
  /** Identifies one tab. Stable while that tab is open, and not reused. */
  sessionId: string
}

/**
 * One participant at one location within a single document, flattened so it can
 * be rendered directly against a field.
 *
 * Unlike {@link PresenceLocation.path}, `path` here is typed as a full `Path`, so
 * keyed and numeric segments are described rather than cast away.
 * @beta
 */
export interface DocumentPresence {
  user: SanityUser
  /** Identifies one tab, so the same person in two tabs appears twice. */
  sessionId: string
  /**
   * The specific document id this participant is in: a draft, published, or
   * version id, depending on which perspective they are editing.
   */
  documentId: string
  /** The focused field path. Empty when they are in the document but no field. */
  path: Path
  /**
   * When they said they were last active, on *their* clock. Fine for display,
   * unreliable for liveness. See {@link PresenceLocation.lastActiveAt}.
   */
  lastActiveAt: string
  /** The Portable Text caret, when they are focused in a Portable Text field. */
  selection?: PresenceSelection
}

/** @beta */
export interface DocumentPresenceOptions extends PresencePerspectiveOptions {
  /**
   * The document to look at. Resolved through the perspective exactly as
   * {@link ReportPresenceOptions.documentId} is, so reads match writes.
   */
  documentId: string
  /**
   * Narrows to participants at or below this field path. Omit it for everyone in
   * the document.
   */
  path?: Path
  /**
   * By default a draft, its published version, and any release versions are
   * treated as the same document, which is what document lists want. Set this to
   * compare ids exactly, which is what field-level indicators want so that a
   * draft and a release version do not bleed into each other.
   */
  excludeVersions?: boolean
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
