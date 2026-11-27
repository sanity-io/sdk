import {type DocumentHandle} from '../config/sanityConfig'

/**
 * Which document variant a history timeline belongs to.
 *
 * @public
 */
export type DocumentVariantType = 'draft' | 'published' | 'version'

/**
 * User-facing document action discriminants in a document history timeline.
 *
 * @public
 */
export type DocumentHistoryEventType =
  | 'created'
  | 'edited'
  | 'published'
  | 'unpublished'
  | 'discarded'
  | 'deleted'

/**
 * What triggered a `published` history event.
 *
 * @public
 */
export type DocumentHistoryPublishCause =
  | 'document.publish'
  | 'release.publish'
  | 'release.schedule'

/**
 * Common fields shared by every event in a document history timeline.
 *
 * @public
 */
export interface DocumentHistoryBaseEvent {
  /** Deterministic client-assigned identifier (`${variantId}:${localId}`) for deduplication and UI keys. */
  id: string
  /** Discriminant identifying the document action. */
  type: DocumentHistoryEventType
  /** User ID of the actor who performed the event, or empty string when unknown. */
  author: string
  /** ISO-8601 timestamp when the event occurred. */
  timestamp: string
  /** Published document group ID (`article-1`). */
  documentId: string
  /** Exact Content Lake variant ID of the timeline stream (`article-1`, `drafts.article-1`, `versions.<release>.article-1`). */
  variantId: string
  /** Variant category of `variantId`. */
  documentVariantType: DocumentVariantType
}

/**
 * Recorded when a document, draft (`drafts.*`), or release version (`versions.*`) is created.
 *
 * @public
 */
export interface DocumentHistoryCreatedEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'created'
  /** Revision ID on the published document, when created directly or present on a published timeline. */
  revisionId?: string
  /** Release name when the created version belongs to a content release. */
  releaseId?: string
  /** Full document ID of the created draft or version, when created as a version. */
  versionId?: string
  /** Initial revision ID on the created draft or version. */
  versionRevisionId?: string
}

/**
 * Individual transaction entry grouped inside a {@link DocumentHistoryEditedEvent}.
 *
 * @public
 */
export interface DocumentHistoryEditTransaction {
  /** Entry discriminant. */
  type: 'editTransaction'
  /** User ID of the author who committed the transaction. */
  author: string
  /** ISO-8601 timestamp of the transaction. */
  timestamp: string
  /** Transaction / revision ID. */
  revisionId: string
}

/**
 * Recorded when a document, draft, or release version is edited. Consecutive edits within a
 * 5-minute window are grouped together.
 *
 * @public
 */
export interface DocumentHistoryEditedEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'edited'
  /** Revision ID of the newest transaction in this edit event. */
  revisionId: string
  /**
   * Revision ID immediately preceding the oldest transaction in this edit group, when known
   * (for example, from a lifecycle's creation event or the previous edit in a transaction stream).
   */
  previousRevisionId?: string
  /** Distinct user IDs who contributed edits to this event. */
  contributors: string[]
  /** Transactions merged into this edit group, ordered newest first. */
  transactions: DocumentHistoryEditTransaction[]
}

/**
 * Recorded when a draft or release version is published to the published document.
 *
 * @public
 */
export interface DocumentHistoryPublishedEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'published'
  /** Resulting revision ID on the published document. */
  revisionId: string
  /** Release name when published from a content release. */
  releaseId?: string
  /** Full document ID of the draft or version that was published. */
  versionId: string
  /** Final revision ID on the draft or version at publish time, when available. */
  versionRevisionId?: string
  /** Action that caused the version to be published. */
  publishCause: DocumentHistoryPublishCause
  /** Contributors attributed to the published changes, when supplied by the server. */
  contributors?: string[]
  /** Creation event paired with this draft lifecycle, used to expand intermediate edits. */
  creationEvent?: DocumentHistoryCreatedEvent
}

/**
 * Recorded when a published document is unpublished into a draft or version.
 *
 * @public
 */
export interface DocumentHistoryUnpublishedEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'unpublished'
  /** Release name when unpublished into a release version. */
  releaseId?: string
  /** Full document ID of the draft or version created from the unpublished document. */
  versionId: string
  /** Revision ID of the newly created draft or version. */
  versionRevisionId: string
}

/**
 * Recorded when a draft or release version is discarded.
 *
 * @public
 */
export interface DocumentHistoryDiscardedEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'discarded'
  /** Release name when the discarded version belonged to a content release. */
  releaseId?: string
  /** Full document ID of the discarded draft or version. */
  versionId: string
  /** Last revision ID on the draft or version before deletion. */
  versionRevisionId: string
  /** Creation event paired with this draft lifecycle, used to expand intermediate edits. */
  creationEvent?: DocumentHistoryCreatedEvent
}

/**
 * Recorded when an entire document group (published document and any drafts/versions) is deleted.
 *
 * @public
 */
export interface DocumentHistoryDeletedEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'deleted'
}

/**
 * Discriminated union of all events in a document history timeline.
 *
 * @public
 */
export type DocumentHistoryEvent =
  | DocumentHistoryCreatedEvent
  | DocumentHistoryEditedEvent
  | DocumentHistoryPublishedEvent
  | DocumentHistoryUnpublishedEvent
  | DocumentHistoryDiscardedEvent
  | DocumentHistoryDeletedEvent

/**
 * Options for reading the merged history timeline of one or more documents.
 *
 * @public
 */
export interface DocumentsHistoryOptions<
  TDataset extends string = string,
  TProjectId extends string = string,
> {
  /** Document handles to read history for. All handles must belong to the same resource. */
  documents: ReadonlyArray<DocumentHandle<string, TDataset, TProjectId>>
  /**
   * Page size for the merged History Events API stream (1-100).
   *
   * @defaultValue 100
   */
  limit?: number
}

/**
 * Options for resolving the merged history timeline of one or more documents as a one-shot promise.
 *
 * @public
 */
export interface ResolveDocumentsHistoryOptions<
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentsHistoryOptions<TDataset, TProjectId> {
  /** Optional abort signal to cancel the pending read. */
  signal?: AbortSignal
}
