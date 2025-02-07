import {getPublishedId} from '@sanity/client/csm'
import {type Mutation, type PatchOperations, type SanityDocumentLike} from '@sanity/types'
import {omit} from 'lodash-es'

import {getDraftId} from '../utils/ids'
import {type DocumentAction} from './actions'
import {type DocumentState, type DocumentStoreState} from './documentStore'
import {type RemoteDocument} from './listen'
import {ActionError, processActions} from './processActions'
import {type DocumentSet} from './processMutations'

const EMPTY_REVISIONS: NonNullable<Required<DocumentState['unverifiedRevisions']>> = {}

export type SyncTransactionState = Pick<
  DocumentStoreState,
  'queued' | 'applied' | 'documentStates' | 'outgoing'
>

type ActionMap = {
  create: 'sanity.action.document.version.create'
  discard: 'sanity.action.document.version.discard'
  unpublish: 'sanity.action.document.unpublish'
  delete: 'sanity.action.document.delete'
  edit: 'sanity.action.document.edit'
  publish: 'sanity.action.document.publish'
}

type OptimisticLock = {
  ifDraftRevisionId?: string
  ifPublishedRevisionId?: string
}

export type HttpAction =
  | {actionType: ActionMap['create']; publishedId: string; attributes: SanityDocumentLike}
  | {actionType: ActionMap['discard']; versionId: string; purge?: boolean}
  | {actionType: ActionMap['unpublish']; draftId: string; publishedId: string}
  | {actionType: ActionMap['delete']; publishedId: string; includeDrafts?: string[]}
  | {actionType: ActionMap['edit']; draftId: string; publishedId: string; patch: PatchOperations}
  | ({actionType: ActionMap['publish']; draftId: string; publishedId: string} & OptimisticLock)

export interface QueuedTransaction {
  transactionId: string
  actions: DocumentAction[]
  disableBatching?: boolean
}

export interface AppliedTransaction extends QueuedTransaction {
  outgoingActions: HttpAction[]
  outgoingMutations: Mutation[]
  base: DocumentSet
  working: DocumentSet
  previous: DocumentSet
  previousRevs: {[TDocumentId in string]?: string}
  /**
   * a timestamp for when this transaction was applied locally
   */
  timestamp: string
}

export interface OutgoingTransaction extends AppliedTransaction {
  disableBatching: boolean
  batchedTransactionIds: string[]
}

export interface UnverifiedDocumentRevision {
  transactionId: string
  documentId: string
  previousRev: string | undefined
  timestamp: string
}

export function queueTransaction(
  prev: SyncTransactionState,
  transaction: QueuedTransaction,
): SyncTransactionState {
  const {transactionId, actions} = transaction
  const ids = Array.from(
    new Set(actions.flatMap((i) => [getDraftId(i.documentId), getPublishedId(i.documentId)])),
  )

  const prevWithSubscriptionIds = ids.reduce(
    (acc, id) => addSubscriptionIdToDocument(acc, id, transactionId),
    prev,
  )

  return {
    ...prevWithSubscriptionIds,
    queued: [...prev.queued, transaction],
  }
}

export function removeQueuedTransaction(
  prev: SyncTransactionState,
  transactionId: string,
): SyncTransactionState {
  const transaction = prev.queued.find((t) => t.transactionId === transactionId)
  if (!transaction) return prev

  const ids = Array.from(
    new Set(
      transaction.actions.flatMap((i) => [getDraftId(i.documentId), getPublishedId(i.documentId)]),
    ),
  )
  const prevWithSubscriptionIds = ids.reduce(
    (acc, id) => removeSubscriptionIdFromDocument(acc, id, transactionId),
    prev,
  )

  return {
    ...prevWithSubscriptionIds,
    queued: prev.queued.filter((t) => transactionId !== t.transactionId),
  }
}

export function applyFirstQueuedTransaction(prev: SyncTransactionState): SyncTransactionState {
  const queued = prev.queued.at(0)
  if (!queued) return prev

  const ids = Array.from(
    new Set(
      queued.actions.flatMap((i) => [getDraftId(i.documentId), getPublishedId(i.documentId)]),
    ),
  )

  // the local value is only ever `undefined` if it has not been loaded yet
  // we can't get the next applied state unless all relevant documents are ready
  if (ids.some((id) => prev.documentStates[id]?.local === undefined)) return prev

  const working = ids.reduce<DocumentSet>((acc, id) => {
    acc[id] = prev.documentStates[id]?.local ?? null
    return acc
  }, {})

  const timestamp = new Date().toISOString()

  const result = processActions({
    ...queued,
    working,
    base: working,
    timestamp,
  })
  const applied: AppliedTransaction = {
    base: working,
    previous: working,
    timestamp,
    ...queued,
    ...result,
  }

  return {
    ...prev,
    applied: [...prev.applied, applied],
    queued: prev.queued.filter((t) => t.transactionId !== queued.transactionId),
    documentStates: Object.entries(result.working).reduce(
      (acc, [id, next]) => {
        const prevDoc = acc[id]
        if (!prevDoc) return acc
        acc[id] = {...prevDoc, local: next}
        return acc
      },
      {...prev.documentStates},
    ),
  }
}

export function batchAppliedTransactions([curr, ...rest]: AppliedTransaction[]):
  | OutgoingTransaction
  | undefined {
  // No transactions? Nothing to batch.
  if (!curr) return undefined

  // Skip transactions with no actions.
  if (!curr.actions.length) return batchAppliedTransactions(rest)

  // If there are multiple actions, we cannot batch further.
  if (curr.actions.length > 1) {
    return {
      ...curr,
      disableBatching: true,
      batchedTransactionIds: [curr.transactionId],
    }
  }

  const [action] = curr.actions

  // If the single action isn't a document.edit or batching is disabled,
  // mark this transaction as non-batchable.
  if (action.type !== 'document.edit' || curr.disableBatching) {
    return {
      ...curr,
      disableBatching: true,
      batchedTransactionIds: [curr.transactionId],
    }
  }

  // Create an outgoing transaction for the single edit action.
  // At this point, batching is allowed.
  const editAction: OutgoingTransaction = {
    ...curr,
    actions: [action],
    disableBatching: false,
    batchedTransactionIds: [curr.transactionId],
  }
  if (!rest.length) return editAction

  const next = batchAppliedTransactions(rest)
  if (!next) return undefined
  if (next.disableBatching) return editAction

  return {
    disableBatching: false,
    // Use the transactionId from the later (next) transaction.
    transactionId: next.transactionId,
    // Accumulate actions: current action first, then later ones.
    actions: [action, ...next.actions],
    // Merge outgoingActions in order.
    outgoingActions: [...curr.outgoingActions, ...next.outgoingActions],
    // Batched transaction IDs: preserve order by placing curr first.
    batchedTransactionIds: [curr.transactionId, ...next.batchedTransactionIds],
    // Merge outgoingMutations in order.
    outgoingMutations: [...curr.outgoingMutations, ...next.outgoingMutations],
    // Working state reflects the latest optimistic changes: later transactions override earlier.
    working: {...curr.working, ...next.working},
    // Base state (base, previous, previousRevs) must reflect the original state.
    // Use curr values (the earliest transaction) to override later ones.
    previousRevs: {...next.previousRevs, ...curr.previousRevs},
    previous: {...next.previous, ...curr.previous},
    base: {...next.base, ...curr.base},
    // Use the earliest timestamp from curr.
    timestamp: curr.timestamp ?? next.timestamp,
  }
}

export function transitionAppliedTransactionsToOutgoing(
  prev: SyncTransactionState,
): SyncTransactionState {
  if (prev.outgoing) return prev

  const transaction = batchAppliedTransactions(prev.applied)
  if (!transaction) return prev

  const {
    transactionId,
    previousRevs,
    working,
    batchedTransactionIds: consumedTransactions,
  } = transaction
  const timestamp = new Date().toISOString()

  return {
    ...prev,
    outgoing: transaction,
    applied: prev.applied.filter((i) => !consumedTransactions.includes(i.transactionId)),
    documentStates: Object.entries(previousRevs).reduce(
      (acc, [documentId, previousRev]) => {
        if (working[documentId]?._rev === previousRev) return acc

        const documentState = prev.documentStates[documentId]
        if (!documentState) return acc

        acc[documentId] = {
          ...documentState,
          unverifiedRevisions: {
            ...documentState.unverifiedRevisions,
            // add unverified revision
            [transactionId]: {documentId, previousRev, transactionId, timestamp},
          },
        }

        return acc
      },
      {...prev.documentStates},
    ),
  }
}

export function cleanupOutgoingTransaction(prev: SyncTransactionState): SyncTransactionState {
  const {outgoing} = prev
  if (!outgoing) return prev

  let next = prev
  const documentIds = new Set(
    outgoing.actions.flatMap((i) => [getDraftId(i.documentId), getPublishedId(i.documentId)]),
  )

  for (const transactionId of outgoing.batchedTransactionIds) {
    for (const documentId of documentIds) {
      next = removeSubscriptionIdFromDocument(next, documentId, transactionId)
    }
  }

  return {...next, outgoing: undefined}
}

export function revertOutgoingTransaction(prev: SyncTransactionState): SyncTransactionState {
  let working = Object.fromEntries(
    Object.entries(prev.documentStates).map(([documentId, documentState]) => [
      documentId,
      documentState?.remote,
    ]),
  )
  const nextApplied: AppliedTransaction[] = []

  for (const t of prev.applied) {
    const next = processActions({...t, working})
    working = next.working
    nextApplied.push({...t, ...next})
  }

  return {
    ...prev,
    applied: nextApplied,
    outgoing: undefined,
    documentStates: Object.fromEntries(
      Object.entries(prev.documentStates)
        .filter((e): e is [string, DocumentState] => !!e[1])
        .map(([documentId, {unverifiedRevisions = {}, local, ...documentState}]) => {
          const next: DocumentState = {
            ...documentState,
            local: documentId in working ? working[documentId] : local,
            unverifiedRevisions:
              prev.outgoing && prev.outgoing.transactionId in unverifiedRevisions
                ? omit(unverifiedRevisions, prev.outgoing.transactionId)
                : unverifiedRevisions,
          }
          return [documentId, next] as const
        }),
    ),
  }
}

export function applyRemoteDocument(
  prev: SyncTransactionState,
  {document, documentId, previousRev, revision, timestamp, type}: RemoteDocument,
  events: DocumentStoreState['events'],
): SyncTransactionState {
  const prevDocState = prev.documentStates[documentId]

  // document state is deleted when there are no more subscribers so we can
  // simply skip if there is no state
  if (!prevDocState) return prev

  const prevUnverifiedRevisions = prevDocState.unverifiedRevisions
  // we send out transactions with IDs generated client-side to identify them
  // when they are observed through the listener. here we can check if this
  // incoming remote document is the result of one of our transactions
  const transactionToVerify = revision ? prevUnverifiedRevisions?.[revision] : undefined

  let unverifiedRevisions = prevUnverifiedRevisions ?? EMPTY_REVISIONS

  if (revision && transactionToVerify) {
    unverifiedRevisions = omit(prevUnverifiedRevisions, revision)
  }

  if (type === 'sync') {
    // remove unverified revisions that are older than our sync time. we don't
    // need to verify them for a rebase anymore because we synced and grabbed
    // the latest document
    unverifiedRevisions = Object.fromEntries(
      Object.entries(unverifiedRevisions).filter(([, unverifiedRevision]) => {
        if (!unverifiedRevision) return false
        return new Date(timestamp).getTime() <= new Date(unverifiedRevision.timestamp).getTime()
      }),
    )
  }
  // if there is a transaction to verify and the previous revision from remote
  // matches the previous revision we expected, we can "fast-forward" and skip
  // rebasing local changes on top of this new base
  if (transactionToVerify && transactionToVerify.previousRev === previousRev) {
    return {
      ...prev,
      applied: prev.applied,
      outgoing: prev.outgoing,
      documentStates: {
        ...prev.documentStates,
        [documentId]: {
          ...prevDocState,
          remote: document,
          remoteRev: revision,
          unverifiedRevisions,
        },
      },
    }
  }

  let working = {
    ...prev.applied[0]?.working,
    ...prev.outgoing?.working,
    [documentId]: document,
  }
  const nextApplied: AppliedTransaction[] = []
  let nextOutgoing: OutgoingTransaction | undefined = prev.outgoing

  for (const t of prev.applied) {
    try {
      const next = processActions({...t, working})
      working = next.working
      nextApplied.push({...t, ...next})
    } catch (error) {
      if (error instanceof ActionError) {
        events.next({
          type: 'rebase-error',
          transactionId: error.transactionId,
          documentId: error.documentId,
          message: error.message,
          error,
        })
        continue
      }
      throw error
    }
  }

  if (prev.outgoing) {
    try {
      const next = processActions({...prev.outgoing, working})
      working = next.working
      nextOutgoing = {...prev.outgoing, ...next}
    } catch (error) {
      if (!(error instanceof ActionError)) throw error

      events.next({
        type: 'rebase-error',
        transactionId: error.transactionId,
        documentId: error.documentId,
        message: error.message,
        error,
      })
      nextOutgoing = undefined
    }
  }

  return {
    ...prev,
    applied: nextApplied,
    outgoing: nextOutgoing,
    documentStates: {
      ...prev.documentStates,
      [documentId]: {
        ...prevDocState,
        remote: document,
        remoteRev: revision,
        local: working[documentId],
        unverifiedRevisions,
      },
    },
  }
}

export function addSubscriptionIdToDocument(
  prev: SyncTransactionState,
  documentId: string,
  subscriptionId: string,
): SyncTransactionState {
  const prevDocState = prev.documentStates?.[documentId]
  const prevSubscriptions = prevDocState?.subscriptions ?? []

  return {
    ...prev,
    documentStates: {
      ...prev.documentStates,
      [documentId]: {
        ...prevDocState,
        id: documentId,
        subscriptions: [...prevSubscriptions, subscriptionId],
      },
    },
  }
}

export function removeSubscriptionIdFromDocument(
  prev: SyncTransactionState,
  documentId: string,
  subscriptionId: string,
): SyncTransactionState {
  const prevDocState = prev.documentStates?.[documentId]
  const prevSubscriptions = prevDocState?.subscriptions ?? []
  const subscriptions = prevSubscriptions.filter((id) => id !== subscriptionId)

  if (!prevDocState) return prev
  if (!subscriptions.length) {
    return {...prev, documentStates: omit(prev.documentStates, documentId)}
  }
  return {
    ...prev,
    documentStates: {
      ...prev.documentStates,
      [documentId]: {...prevDocState, subscriptions: subscriptions},
    },
  }
}
