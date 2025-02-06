import {type SanityClient} from '@sanity/client'

import {type DocumentAction} from './actions'
import {type OutgoingTransaction} from './reducers'

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

export interface ActionErrorEvent {
  type: 'error'
  documentId: string
  transactionId: string
  message: string
  error: unknown
}
export interface TransactionAcceptedEvent {
  type: 'accepted'
  outgoing: OutgoingTransaction
  result: Awaited<ReturnType<SanityClient['action']>>
}
export interface TransactionRevertedEvent {
  type: 'reverted'
  message: string
  error: unknown
  outgoing: OutgoingTransaction
}
export interface DocumentRebaseErrorEvent {
  type: 'rebase-error'
  documentId: string
  transactionId: string
  message: string
  error: unknown
}

export interface DocumentEditedEvent {
  type: 'edited'
  documentId: string
  outgoing: OutgoingTransaction
}
export interface DocumentCreatedEvent {
  type: 'created'
  documentId: string
  outgoing: OutgoingTransaction
}
export interface DocumentDeletedEvent {
  type: 'deleted'
  documentId: string
  outgoing: OutgoingTransaction
}
export interface DocumentPublishedEvent {
  type: 'published'
  documentId: string
  outgoing: OutgoingTransaction
}
export interface DocumentUnpublishedEvent {
  type: 'unpublished'
  documentId: string
  outgoing: OutgoingTransaction
}
export interface DocumentDiscardedEvent {
  type: 'discarded'
  documentId: string
  outgoing: OutgoingTransaction
}

export function getDocumentEvents(outgoing: OutgoingTransaction): DocumentEvent[] {
  const documentIdsByAction = Object.entries(
    outgoing.actions.reduce(
      (acc, {type, documentId}) => {
        const ids = acc[type] || new Set()
        ids.add(documentId)
        acc[type] = ids
        return acc
      },
      {} as Record<DocumentAction['type'], Set<string>>,
    ),
  ) as [DocumentAction['type'], Set<string>][]

  const actionMap = {
    'document.create': 'created',
    'document.delete': 'deleted',
    'document.discard': 'discarded',
    'document.edit': 'edited',
    'document.publish': 'published',
    'document.unpublish': 'unpublished',
  } satisfies Record<DocumentAction['type'], DocumentEvent['type']>

  return documentIdsByAction.flatMap(([actionType, documentIds]) =>
    Array.from(documentIds).map(
      (documentId): DocumentEvent => ({type: actionMap[actionType], documentId, outgoing}),
    ),
  )
}
