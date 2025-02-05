import {getPublishedId} from '@sanity/client/csm'
import {type Mutation, type PatchOperations, type SanityDocumentLike} from '@sanity/types'
import {omit} from 'lodash-es'

import {getDraftId} from '../preview/util'
import {type DocumentAction} from './actions'
import {type DocumentState, type DocumentStoreState} from './documentStore'
import {type RemoteDocument} from './listen'
import {processActions} from './processActions'
import {type DocumentSet} from './processMutations'

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
}

export interface AppliedTransaction {
  transactionId: string
  actions: DocumentAction[]
  outgoingActions: HttpAction[]
  outgoingMutations: Mutation[]
  base: DocumentSet
  working: DocumentSet
  previous: DocumentSet
  previousRevs: {[TDocumentId in string]?: string}
}

export interface OutgoingTransaction {
  transactionId: string
  actions: DocumentAction[]
  outgoingActions: HttpAction[]
  outgoingMutations: Mutation[]
  shouldBatch: boolean
  consumedTransactions: string[]
  previousRevs: {[TDocumentId in string]?: string}
  previous: DocumentSet
  base: DocumentSet
  working: DocumentSet
}

export interface UnverifiedDocumentRevision {
  transactionId: string
  documentId: string
  previousRev: string | undefined
}

export function queueTransaction(
  prev: SyncTransactionState,
  transaction: QueuedTransaction,
): SyncTransactionState {
  const {transactionId, actions} = transaction
  const ids = Array.from(new Set(actions.map((i) => i.documentId)))

  const prevWithSubscriptionIds = ids.reduce(
    (acc, id) => addSubscriptionIdToDocument(acc, id, transactionId),
    prev,
  )

  return {
    ...prevWithSubscriptionIds,
    queued: [...prev.queued, transaction],
  }
}

export function applyFirstQueuedTransaction(prev: SyncTransactionState): SyncTransactionState {
  const queued = prev.queued.at(0)
  if (!queued) return prev

  const ids = Array.from(
    new Set(
      queued.actions.map((i) => i.documentId).flatMap((i) => [getDraftId(i), getPublishedId(i)]),
    ),
  )

  // the local value is only ever `undefined` if it has not been loaded yet
  // we can't get the next applied state unless all relevant documents are ready
  if (ids.some((id) => prev.documentStates[id]?.local === undefined)) return prev

  const working = ids.reduce<DocumentSet>((acc, id) => {
    acc[id] = prev.documentStates[id]?.local ?? null
    return acc
  }, {})

  const result = processActions({
    ...queued,
    working,
    base: working,
  })
  const applied: AppliedTransaction = {
    base: working,
    previous: working,
    ...queued,
    ...result,
  }

  const prevWithoutSubscriptionsIds = ids.reduce(
    (acc, id) => removeSubscriptionIdFromDocument(acc, id, queued.transactionId),
    prev,
  )

  return {
    ...prevWithoutSubscriptionsIds,
    applied: [...prev.applied, applied],
    queued: prev.queued.filter((t) => t.transactionId !== queued.transactionId),
    documentStates: Object.entries(result.working).reduce(
      (acc, [id, next]) => {
        const prevDoc = acc[id]
        if (!prevDoc) return acc
        acc[id] = {...prevDoc, local: next}
        return acc
      },
      {...prevWithoutSubscriptionsIds.documentStates},
    ),
  }
}

export function batchAppliedTransactions([curr, ...rest]: AppliedTransaction[]):
  | OutgoingTransaction
  | undefined {
  if (!curr) return undefined
  if (!curr.actions.length) return batchAppliedTransactions(rest)

  if (curr.actions.length > 1) {
    return {
      transactionId: curr.transactionId,
      actions: curr.actions,
      outgoingActions: curr.outgoingActions,
      shouldBatch: false,
      consumedTransactions: [curr.transactionId],
      previousRevs: curr.previousRevs,
      outgoingMutations: curr.outgoingMutations,
      base: curr.base,
      working: curr.working,
      previous: curr.previous,
    }
  }

  const [action] = curr.actions
  if (action.type !== 'document.edit') {
    return {
      transactionId: curr.transactionId,
      actions: curr.actions,
      outgoingActions: curr.outgoingActions,
      shouldBatch: false,
      consumedTransactions: [curr.transactionId],
      previousRevs: curr.previousRevs,
      outgoingMutations: curr.outgoingMutations,
      base: curr.base,
      working: curr.working,
      previous: curr.previous,
    }
  }

  const editAction: OutgoingTransaction = {
    transactionId: curr.transactionId,
    actions: [action],
    outgoingActions: curr.outgoingActions,
    shouldBatch: true,
    consumedTransactions: [curr.transactionId],
    previousRevs: curr.previousRevs,
    outgoingMutations: curr.outgoingMutations,
    base: curr.base,
    working: curr.working,
    previous: curr.previous,
  }
  if (!rest.length) return editAction

  const tFirst = batchAppliedTransactions(rest)
  if (!tFirst) return undefined
  if (!tFirst.shouldBatch) return editAction

  return {
    shouldBatch: true,
    transactionId: tFirst.transactionId,
    actions: [action, ...tFirst.actions],
    outgoingActions: [...curr.outgoingActions, ...tFirst.outgoingActions],
    consumedTransactions: [curr.transactionId, ...tFirst.consumedTransactions],
    outgoingMutations: [...curr.outgoingMutations, ...tFirst.outgoingMutations],
    working: {...curr.working, ...tFirst.working},
    previousRevs: {...tFirst.previousRevs, ...curr.previousRevs},
    previous: {...tFirst.previous, ...curr.previous},
    base: {...tFirst.base, ...curr.base},
  }
}

export function transitionAppliedTransactionsToOutgoing(
  prev: SyncTransactionState,
): SyncTransactionState {
  if (prev.outgoing) return prev

  const transaction = batchAppliedTransactions(prev.applied)
  if (!transaction) return prev

  const {transactionId, previousRevs, consumedTransactions} = transaction

  return {
    ...prev,
    outgoing: transaction,
    applied: prev.applied.filter((i) => !consumedTransactions.includes(i.transactionId)),
    documentStates: Object.entries(previousRevs).reduce(
      (acc, [documentId, previousRev]) => {
        const documentState = prev.documentStates[documentId]
        if (!documentState) return acc

        acc[documentId] = {
          ...documentState,
          unverifiedRevisions: {
            ...documentState.unverifiedRevisions,
            // add unverified revision
            [transactionId]: {documentId, previousRev, transactionId},
          },
        }

        return acc
      },
      {...prev.documentStates},
    ),
  }
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
  {document, documentId, previousRev, revision, timestamp}: RemoteDocument,
): SyncTransactionState {
  const prevDocState = prev.documentStates[documentId]

  // document state is deleted when there are no more subscribers so we can
  // simply skip if there is no state
  if (!prevDocState) return prev

  // we send out transactions with IDs generated client-side to identify them
  // when they are observed through the listener. here we can check if this
  // incoming remote document is the result of one of our transactions
  const transactionToVerify = revision
    ? prev.documentStates[documentId]?.unverifiedRevisions?.[revision]
    : undefined

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
          unverifiedRevisions: revision
            ? omit(prevDocState.unverifiedRevisions, revision)
            : prevDocState.unverifiedRevisions,
          local:
            prevDocState.local &&
            timestamp &&
            new Date(timestamp).getTime() > new Date(prevDocState.local._updatedAt).getTime()
              ? Object.assign({...prevDocState.local}, {_updatedAt: timestamp})
              : prevDocState.local,
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
    const next = processActions({...t, working})
    working = next.working
    nextApplied.push({...t, ...next})
  }
  if (prev.outgoing) {
    const next = processActions({...prev.outgoing, working})
    working = next.working
    nextOutgoing = {...prev.outgoing, ...next}
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
        unverifiedRevisions:
          revision && transactionToVerify
            ? omit(prevDocState.unverifiedRevisions, revision)
            : prevDocState.unverifiedRevisions,
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
