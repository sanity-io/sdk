import {type MultipleMutationResult, type SanityClient} from '@sanity/client'
import {type PatchOperations} from '@sanity/types'

import {type DocumentAction, type ReleaseAction} from './actions'
import {getReleaseDocumentId, isReleaseAction} from './processActions/releaseUtil'
import {type OutgoingTransaction} from './reducers'

/** @beta Response body from submitting an outgoing transaction (actions or mutations API). */
export type DocumentTransactionSubmissionResult =
  | Awaited<ReturnType<SanityClient['action']>>
  | MultipleMutationResult

/** @beta */
export type DocumentEvent =
  | ActionErrorEvent
  | TransactionRevertedEvent
  | TransactionAcceptedEvent
  | DocumentRebaseErrorEvent
  | DocumentEditedEvent
  | DocumentCreatedEvent
  | DocumentDeletedEvent
  | DocumentPublishedEvent
  | DocumentUnpublishedEvent
  | DocumentDiscardedEvent
  | DocumentRemotePatchesEvent

/**
 * @beta
 * Event emitted when a precondition to applying an action fails.
 * (For example: when trying to edit a document that no longer exists.)
 */
export interface ActionErrorEvent {
  type: 'error'
  documentId: string
  transactionId: string
  message: string
  error: unknown
}
/**
 * @beta
 * Event emitted when a transaction is accepted.
 */
export interface TransactionAcceptedEvent {
  type: 'accepted'
  outgoing: OutgoingTransaction
  result: DocumentTransactionSubmissionResult
}
/**
 * @beta
 * Event emitted when a transaction is reverted.
 */
export interface TransactionRevertedEvent {
  type: 'reverted'
  message: string
  error: unknown
  outgoing: OutgoingTransaction
}
/**
 * @beta
 * Event emitted when an attempt to apply local changes to a modified remote document fails.
 */
export interface DocumentRebaseErrorEvent {
  type: 'rebase-error'
  documentId: string
  transactionId: string
  message: string
  error: unknown
}
/**
 * @beta
 * Event emitted when a document is edited.
 */
export interface DocumentEditedEvent {
  type: 'edited'
  documentId: string
  outgoing: OutgoingTransaction
}
/**
 * @beta
 * Event emitted when a document is created.
 */
export interface DocumentCreatedEvent {
  type: 'created'
  documentId: string
  outgoing: OutgoingTransaction
}
/**
 * @beta
 * Event emitted when a document is deleted.
 */
export interface DocumentDeletedEvent {
  type: 'deleted'
  documentId: string
  outgoing: OutgoingTransaction
}
/**
 * @beta
 * Event emitted when a document is published.
 */
export interface DocumentPublishedEvent {
  type: 'published'
  documentId: string
  outgoing: OutgoingTransaction
}
/**
 * @beta
 * Event emitted when a document is unpublished.
 */
export interface DocumentUnpublishedEvent {
  type: 'unpublished'
  documentId: string
  outgoing: OutgoingTransaction
}
/**
 * @beta
 * Event emitted when a document version is discarded.
 */
export interface DocumentDiscardedEvent {
  type: 'discarded'
  documentId: string
  outgoing: OutgoingTransaction
}

/**
 * @beta
 * Event emitted when patches for a document are observed through the listener.
 *
 * Unlike the whole-document snapshots the store keeps, these are the raw patch
 * operations from the transaction that produced the change, preserving the
 * operational intent of the edit (e.g. keyed array inserts/unsets). Consumers
 * that maintain their own local state, like collaborative text editors, can
 * apply these directly instead of diffing document snapshots.
 *
 * `origin` is `'local'` when the transaction was submitted by this document
 * store instance (an own edit observed back through the listener) and
 * `'remote'` when it came from another client.
 */
export interface DocumentRemotePatchesEvent {
  type: 'remote-patches'
  /** The ID of the document version the patches apply to (e.g. a draft ID). */
  documentId: string
  /** The transaction ID that carried these patches. */
  transactionId: string
  /** The revision the document was at before this transaction. */
  previousRev?: string
  /** The timestamp of the transaction. */
  timestamp: string
  /** The patch operations, rooted at the document. */
  patches: PatchOperations[]
  /** Whether the transaction originated from this client or another one. */
  origin: 'local' | 'remote'
}

// Release actions that write a mutation to the local release doc map onto
// the regular per-document events with `documentId = '_.releases.<releaseId>'`.
// The other release actions (publish/schedule/unschedule/archive/unarchive)
// don't mutate local state, so they aren't in the map and get skipped — they
// surface through the transaction-level `accepted`/`reverted` events instead.
const actionMap = {
  'document.create': 'created',
  'document.delete': 'deleted',
  'document.discard': 'discarded',
  'document.edit': 'edited',
  'document.publish': 'published',
  'document.unpublish': 'unpublished',
  'release.create': 'created',
  'release.edit': 'edited',
  'release.delete': 'deleted',
} satisfies Partial<Record<DocumentAction['type'] | ReleaseAction['type'], DocumentEvent['type']>>

type MappedActionType = keyof typeof actionMap

export function getDocumentEvents(outgoing: OutgoingTransaction): DocumentEvent[] {
  const documentIdsByAction = outgoing.actions.reduce(
    (acc, action) => {
      if (!(action.type in actionMap)) return acc
      const documentId = isReleaseAction(action)
        ? getReleaseDocumentId(action.releaseId)
        : action.documentId
      if (!documentId) return acc
      const type = action.type as MappedActionType
      const ids = acc[type] ?? new Set<string>()
      ids.add(documentId)
      acc[type] = ids
      return acc
    },
    {} as Partial<Record<MappedActionType, Set<string>>>,
  )

  return Object.entries(documentIdsByAction).flatMap(([actionType, documentIds]) =>
    Array.from(documentIds ?? []).map(
      (documentId): DocumentEvent => ({
        type: actionMap[actionType as MappedActionType],
        documentId,
        outgoing,
      }),
    ),
  )
}
