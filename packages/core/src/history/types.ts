import {type DocumentHandle} from '../config/sanityConfig'

/**
 * Which document variant a history timeline belongs to.
 *
 * @beta
 */
export type DocumentVariantType = 'draft' | 'published' | 'version'

/**
 * All event discriminants emitted or synthesized in a document history timeline.
 *
 * @beta
 */
export type DocumentHistoryEventType =
  | 'createLiveDocument'
  | 'updateLiveDocument'
  | 'deleteDocumentGroup'
  | 'createDocumentVersion'
  | 'deleteDocumentVersion'
  | 'publishDocumentVersion'
  | 'unpublishDocument'
  | 'editDocumentVersion'
  | 'historyCleared'

/**
 * What triggered a `publishDocumentVersion` history event.
 *
 * @beta
 */
export type DocumentHistoryPublishCause =
  | 'document.publish'
  | 'release.publish'
  | 'release.schedule'

/**
 * Common fields shared by every event in a document history timeline.
 *
 * @beta
 */
export interface DocumentHistoryBaseEvent {
  /** Deterministic client-assigned identifier for deduplication and UI keys. */
  id: string
  /** Discriminant identifying the kind of history event. */
  type: DocumentHistoryEventType
  /** User ID of the actor who performed the event, or empty string when unknown. */
  author: string
  /** ISO-8601 timestamp when the event occurred. */
  timestamp: string
  /** Document ID attributed to this event in the viewed timeline. */
  documentId: string
  /** Variant category of the timeline being viewed. */
  documentVariantType: DocumentVariantType
}

/**
 * Recorded when a live-edit or directly mutated published document is created.
 *
 * @beta
 */
export interface CreateLiveDocumentHistoryEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'createLiveDocument'
  /** Revision ID created on the published document. */
  revisionId: string
}

/**
 * Recorded when a live-edit or directly mutated published document is updated.
 *
 * @beta
 */
export interface UpdateLiveDocumentHistoryEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'updateLiveDocument'
  /** Revision ID written to the published document. */
  revisionId: string
}

/**
 * Recorded when an entire document group (published document and any drafts/versions) is deleted.
 *
 * @beta
 */
export interface DeleteDocumentGroupHistoryEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'deleteDocumentGroup'
}

/**
 * Recorded when a draft (`drafts.*`) or release version (`versions.*`) is created.
 *
 * @beta
 */
export interface CreateDocumentVersionHistoryEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'createDocumentVersion'
  /** Release name when the version belongs to a content release. */
  releaseId?: string
  /** Full document ID of the created draft or version. */
  versionId: string
  /** Initial revision ID on the created draft or version. */
  versionRevisionId: string
  /** Published revision ID when present on a published timeline. */
  revisionId?: string
  /** ID of the enclosing publish or delete event when linked on a draft timeline. */
  parentId?: string
}

/**
 * Recorded when a draft or release version is discarded.
 *
 * @beta
 */
export interface DeleteDocumentVersionHistoryEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'deleteDocumentVersion'
  /** Release name when the discarded version belonged to a content release. */
  releaseId?: string
  /** Full document ID of the discarded draft or version. */
  versionId: string
  /** Last revision ID on the draft or version before deletion. */
  versionRevisionId: string
  /** Creation event paired with this draft lifecycle, used to expand intermediate edits. */
  creationEvent?: CreateDocumentVersionHistoryEvent
}

/**
 * Recorded when a draft or release version is published to the published document.
 *
 * @beta
 */
export interface PublishDocumentVersionHistoryEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'publishDocumentVersion'
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
  creationEvent?: CreateDocumentVersionHistoryEvent
}

/**
 * Recorded when a published document is unpublished into a draft or version.
 *
 * @beta
 */
export interface UnpublishDocumentHistoryEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'unpublishDocument'
  /** Release name when unpublished into a release version. */
  releaseId?: string
  /** Full document ID of the draft or version created from the unpublished document. */
  versionId: string
  /** Revision ID of the newly created draft or version. */
  versionRevisionId: string
}

/**
 * Individual transaction entry grouped inside an {@link EditDocumentVersionHistoryEvent}.
 *
 * @beta
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
 * Client-synthesized event representing one or more draft or version edits merged within a
 * 5-minute window.
 *
 * @beta
 */
export interface EditDocumentVersionHistoryEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'editDocumentVersion'
  /** Revision ID of the newest transaction in this merged edit group. */
  revisionId: string
  /** Distinct user IDs who contributed transactions to this edit group. */
  contributors: string[]
  /** Transactions merged into this edit group, ordered newest first. */
  transactions: DocumentHistoryEditTransaction[]
  /** ID of the parent publish or discard event when this edit was expanded on demand. */
  parentId?: string
}

/**
 * Client-synthesized marker emitted when semantic history events were pruned by retention while
 * edit transactions remain in the transaction log.
 *
 * @beta
 */
export interface HistoryClearedEvent extends DocumentHistoryBaseEvent {
  /** Event discriminant. */
  type: 'historyCleared'
}

/**
 * Discriminated union of all events in a document history timeline.
 *
 * @beta
 */
export type DocumentHistoryEvent =
  | CreateLiveDocumentHistoryEvent
  | UpdateLiveDocumentHistoryEvent
  | DeleteDocumentGroupHistoryEvent
  | CreateDocumentVersionHistoryEvent
  | DeleteDocumentVersionHistoryEvent
  | PublishDocumentVersionHistoryEvent
  | UnpublishDocumentHistoryEvent
  | EditDocumentVersionHistoryEvent
  | HistoryClearedEvent

/**
 * Options for reading a document's history timeline.
 *
 * @beta
 */
export interface DocumentHistoryOptions<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  /**
   * Page size for the History Events API (1-100).
   *
   * @defaultValue 100
   */
  limit?: number
  /**
   * Whether to synthesize 5-minute grouped edit events from `/transactions` for drafts and
   * versions.
   *
   * @defaultValue true
   */
  includeEditEvents?: boolean
}

/**
 * Options for resolving a document's history timeline as a one-shot promise.
 *
 * @beta
 */
export interface ResolveDocumentHistoryOptions<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHistoryOptions<TDocumentType, TDataset, TProjectId> {
  /** Optional abort signal to cancel the pending read. */
  signal?: AbortSignal
}

/**
 * Returns `true` when `event` is a {@link CreateLiveDocumentHistoryEvent}.
 *
 * @beta
 */
export function isCreateLiveDocumentHistoryEvent(
  event: DocumentHistoryEvent,
): event is CreateLiveDocumentHistoryEvent {
  return event.type === 'createLiveDocument'
}

/**
 * Returns `true` when `event` is an {@link UpdateLiveDocumentHistoryEvent}.
 *
 * @beta
 */
export function isUpdateLiveDocumentHistoryEvent(
  event: DocumentHistoryEvent,
): event is UpdateLiveDocumentHistoryEvent {
  return event.type === 'updateLiveDocument'
}

/**
 * Returns `true` when `event` is a {@link DeleteDocumentGroupHistoryEvent}.
 *
 * @beta
 */
export function isDeleteDocumentGroupHistoryEvent(
  event: DocumentHistoryEvent,
): event is DeleteDocumentGroupHistoryEvent {
  return event.type === 'deleteDocumentGroup'
}

/**
 * Returns `true` when `event` is a {@link CreateDocumentVersionHistoryEvent}.
 *
 * @beta
 */
export function isCreateDocumentVersionHistoryEvent(
  event: DocumentHistoryEvent,
): event is CreateDocumentVersionHistoryEvent {
  return event.type === 'createDocumentVersion'
}

/**
 * Returns `true` when `event` is a {@link DeleteDocumentVersionHistoryEvent}.
 *
 * @beta
 */
export function isDeleteDocumentVersionHistoryEvent(
  event: DocumentHistoryEvent,
): event is DeleteDocumentVersionHistoryEvent {
  return event.type === 'deleteDocumentVersion'
}

/**
 * Returns `true` when `event` is a {@link PublishDocumentVersionHistoryEvent}.
 *
 * @beta
 */
export function isPublishDocumentVersionHistoryEvent(
  event: DocumentHistoryEvent,
): event is PublishDocumentVersionHistoryEvent {
  return event.type === 'publishDocumentVersion'
}

/**
 * Returns `true` when `event` is an {@link UnpublishDocumentHistoryEvent}.
 *
 * @beta
 */
export function isUnpublishDocumentHistoryEvent(
  event: DocumentHistoryEvent,
): event is UnpublishDocumentHistoryEvent {
  return event.type === 'unpublishDocument'
}

/**
 * Returns `true` when `event` is an {@link EditDocumentVersionHistoryEvent}.
 *
 * @beta
 */
export function isEditDocumentVersionHistoryEvent(
  event: DocumentHistoryEvent,
): event is EditDocumentVersionHistoryEvent {
  return event.type === 'editDocumentVersion'
}

/**
 * Returns `true` when `event` is a {@link HistoryClearedEvent}.
 *
 * @beta
 */
export function isHistoryClearedEvent(event: DocumentHistoryEvent): event is HistoryClearedEvent {
  return event.type === 'historyCleared'
}
