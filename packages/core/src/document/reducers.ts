import {getPublishedId} from '@sanity/client/csm'
import {type Mutation, type PatchOperations, type SanityDocumentLike} from '@sanity/types'
import {omit} from 'lodash-es'

import {type StoreContext} from '../store/defineStore'
import {getDraftId, insecureRandomId} from '../utils/ids'
import {type DocumentAction} from './actions'
import {DOCUMENT_STATE_CLEAR_DELAY} from './documentConstants'
import {type DocumentState, type DocumentStoreState} from './documentStore'
import {type RemoteDocument} from './listen'
import {ActionError, processActions} from './processActions'
import {type DocumentSet} from './processMutations'

const EMPTY_REVISIONS: NonNullable<Required<DocumentState['unverifiedRevisions']>> = {}

export type SyncTransactionState = Pick<
  DocumentStoreState,
  'queued' | 'applied' | 'documentStates' | 'outgoing' | 'grants'
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

/**
 * Represents a transaction that is queued to be applied but has not yet been
 * applied. A transaction will remain in a queued state until all required
 * documents for the transactions are available locally.
 */
export interface QueuedTransaction {
  /**
   * the ID of this transaction. this is generated client-side.
   */
  transactionId: string
  /**
   * the high-level actions associated with this transaction. note that these
   * actions don't mention draft IDs and is meant to abstract away the draft
   * model from users.
   */
  actions: DocumentAction[]
  /**
   * An optional flag set to disable this transaction from being batched with
   * other transactions.
   */
  disableBatching?: boolean
}

/**
 * Represents a transaction that has been applied locally but has not been
 * committed/transitioned-to-outgoing. These transactions are visible to the
 * user but may be rebased upon a new working document set. Applied transactions
 * also contain the resulting `outgoingActions` that will be submitted to
 * Content Lake. These `outgoingActions` depend on the state of the working
 * documents so they are recomputed on rebase and are only relevant to applied
 * actions (we cannot compute `outgoingActions` for queued transactions because
 * we haven't resolved the set of documents the actions are dependent on yet).
 *
 * In order to support better conflict resolution, the original `previous` set
 * is saved as the `base` set.
 */
export interface AppliedTransaction extends QueuedTransaction {
  /**
   * the resulting set of documents after the actions have been applied
   */
  working: DocumentSet

  /**
   * the previous set of documents before the action was applied
   */
  previous: DocumentSet

  /**
   * the original `previous` document set captured when this action was
   * originally applied. this is used as a reference point to do a 3-way merge
   * if this applied transaction ever needs to be reapplied on a different
   * set of documents.
   */
  base: DocumentSet

  /**
   * the `_rev`s from `previous` document set
   */
  previousRevs: {[TDocumentId in string]?: string}

  /**
   * a timestamp for when this transaction was applied locally
   */
  timestamp: string

  /**
   * the resulting HTTP actions derived from the state of the `working` document
   * set. these are sent to Content Lake as-is when this transaction is batched
   * and transitioned into an outgoing transaction.
   */
  outgoingActions: HttpAction[]

  /**
   * similar to `outgoingActions` but comprised of mutations instead of action.
   * this left here for debugging purposes but could be used to send mutations
   * to Content Lake instead of actions.
   */
  outgoingMutations: Mutation[]
}

/**
 * Represents a set of applied transactions batched into a single outgoing
 * transaction. An outgoing transaction is the result of batching many applied
 * actions. An outgoing transaction may be reverted locally if the server
 * does not accept it.
 */
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
  const prevWithSubscriptionIds = getDocumentIdsFromActions(actions).reduce(
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

  const prevWithSubscriptionIds = getDocumentIdsFromActions(transaction.actions).reduce(
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
  if (!prev.grants) return prev

  const ids = getDocumentIdsFromActions(queued.actions)
  // the local value is only ever `undefined` if it has not been loaded yet
  // we can't get the next applied state unless all relevant documents are ready
  if (ids.some((id) => prev.documentStates[id]?.local === undefined)) return prev

  const working = ids.reduce<DocumentSet>((acc, id) => {
    acc[id] = prev.documentStates[id]?.local
    return acc
  }, {})

  const timestamp = new Date().toISOString()

  const result = processActions({
    ...queued,
    working,
    base: working,
    timestamp,
    grants: prev.grants,
  })
  const applied: AppliedTransaction = {
    ...queued,
    ...result,
    base: result.previous,
    timestamp,
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
  const ids = getDocumentIdsFromActions(outgoing.actions)
  for (const transactionId of outgoing.batchedTransactionIds) {
    for (const documentId of ids) {
      next = removeSubscriptionIdFromDocument(next, documentId, transactionId)
    }
  }

  return {...next, outgoing: undefined}
}

export function revertOutgoingTransaction(prev: SyncTransactionState): SyncTransactionState {
  if (!prev.grants) return prev
  let working = Object.fromEntries(
    Object.entries(prev.documentStates).map(([documentId, documentState]) => [
      documentId,
      documentState?.remote,
    ]),
  )
  const nextApplied: AppliedTransaction[] = []

  for (const t of prev.applied) {
    try {
      const next = processActions({...t, working, grants: prev.grants})
      working = next.working
      nextApplied.push({...t, ...next})
    } catch (error) {
      // if we're already reverting a transaction, skip any applied actions if
      // they throw while we rebuild the state
      if (error instanceof ActionError) continue
      throw error
    }
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
  if (!prev.grants) return prev
  const prevDocState = prev.documentStates[documentId]

  // document state is deleted when there are no more subscribers so we can
  // simply skip if there is no state
  if (!prevDocState) return prev

  // we send out transactions with IDs generated client-side to identify them
  // when they are observed through the listener. here we can check if this
  // incoming remote document is the result of one of our transactions
  const prevUnverifiedRevisions = prevDocState.unverifiedRevisions
  const revisionToVerify = revision ? prevUnverifiedRevisions?.[revision] : undefined
  let unverifiedRevisions = prevUnverifiedRevisions ?? EMPTY_REVISIONS
  if (revision && revisionToVerify) {
    unverifiedRevisions = omit(prevUnverifiedRevisions, revision)
  }

  // if this remote document is from a `'sync'` event (meaning that the whole
  // thing was just fetched and not re-created from mutations)
  if (type === 'sync') {
    // then remove unverified revisions that are older than our sync time. we
    // don't need to verify them for a rebase any more because we synced and
    // grabbed the latest document
    unverifiedRevisions = Object.fromEntries(
      Object.entries(unverifiedRevisions).filter(([, unverifiedRevision]) => {
        if (!unverifiedRevision) return false
        return new Date(timestamp).getTime() <= new Date(unverifiedRevision.timestamp).getTime()
      }),
    )
  }

  // if there is a revision to verify and the previous revision from remote
  // matches the previous revision we expected, we can "fast-forward" and skip
  // rebasing local changes on top of this new base
  if (revisionToVerify && revisionToVerify.previousRev === previousRev) {
    return {
      ...prev,
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

  // if we got this far, this means that we could not fast-forward this revision
  // for this document. now we can rebase our local changes (if any) on top of
  // this new base from remote. in order to do that we grab the set of documents
  // captured before the earliest local transaction
  const previous = prev.applied.at(0)?.previous
  // our initial working set now is the state of the documents before any of our
  // local transactions plus the newly updated document from remote
  let working = {...previous, [documentId]: document}
  const nextApplied: AppliedTransaction[] = []

  // now we can iterate through our applied (but not yet committed) transactions
  // starting with the updated working set and re-apply each transaction in
  // order creating a new set of applied transactions as we go.
  //
  // NOTE: we don't want to rebase over the outgoing transaction because that
  // transaction is already on its way to the server. if an outgoing transaction
  // needs to be rebased, then it eventually will be when we see that
  // transaction again through the listener and this same flow will run then
  for (const curr of prev.applied) {
    try {
      const next = processActions({...curr, working, grants: prev.grants})
      working = next.working
      // next includes an updated `previous` set and `working` set and updates
      // the `outgoingAction` and `outgoingMutations`. the `base` set from the
      // original applied transaction gets put back into the updated transaction
      // as-is to preserve the intended base for a 3-way merge
      nextApplied.push({...curr, ...next})
    } catch (error) {
      // if processing the action ever throws a related error, we can skip this
      // local transaction and report the error to the user
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

  return {
    ...prev,
    applied: nextApplied,
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

export function manageSubscriberIds(
  {state}: StoreContext<SyncTransactionState>,
  documentId: string | string[],
): () => void {
  const documentIds = Array.from(
    new Set(
      (Array.isArray(documentId) ? documentId : [documentId]).flatMap((id) => [
        getPublishedId(id),
        getDraftId(id),
      ]),
    ),
  )
  const subscriptionId = insecureRandomId()
  state.set('addSubscribers', (prev) =>
    documentIds.reduce(
      (acc, id) => addSubscriptionIdToDocument(acc, id, subscriptionId),
      prev as SyncTransactionState,
    ),
  )

  return () => {
    setTimeout(() => {
      state.set('removeSubscribers', (prev) =>
        documentIds.reduce(
          (acc, id) => removeSubscriptionIdFromDocument(acc, id, subscriptionId),
          prev as SyncTransactionState,
        ),
      )
    }, DOCUMENT_STATE_CLEAR_DELAY)
  }
}

export function getDocumentIdsFromActions(action: DocumentAction | DocumentAction[]): string[] {
  const actions = Array.isArray(action) ? action : [action]
  return Array.from(
    new Set(
      actions
        .map((i) => i.documentId)
        .filter((i) => typeof i === 'string')
        .flatMap((documentId) => [getPublishedId(documentId), getDraftId(documentId)]),
    ),
  )
}
