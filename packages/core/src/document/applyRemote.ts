import {omit} from 'lodash-es'

import {applyActionsFromBase} from './applyActionsFromBase'
import {
  type AppliedTransaction,
  type OutgoingTransaction,
  type SyncTransactionState,
} from './documentStore'
import {type RemoteDocument} from './listen'

interface ApplyRemoteOptions extends SyncTransactionState {
  remote: RemoteDocument
}

export function applyRemote({
  remote: {document, documentId, previousRev, revision, timestamp},
  ...prev
}: ApplyRemoteOptions): SyncTransactionState {
  const prevDocumentState = prev.documents[documentId]

  // document state is deleted when there are no more subscribers so we can
  // simply skip if there is no state
  if (!prevDocumentState) return prev

  // we send out transactions with IDs generated client-side to identify them
  // when they are observed through the listener. here we can check if this
  // incoming remote document is the result of one of our transactions
  const transactionToVerify = revision
    ? prev.documents[documentId]?.unverifiedTransactions[revision]
    : undefined

  // if there is a transaction to verify and the previous revision from remote
  // matches the previous revision we expected, we can "fast-forward" and skip
  // rebasing local changes on top of this new base
  if (transactionToVerify && transactionToVerify.previousRev === previousRev) {
    return {
      ...prev,
      applied: prev.applied,
      outgoing: prev.outgoing,
      documents: {
        ...prev.documents,
        [documentId]: {
          ...prevDocumentState,
          base: document,
          baseRev: revision,
          unverifiedTransactions: revision
            ? omit(prevDocumentState.unverifiedTransactions, revision)
            : prevDocumentState.unverifiedTransactions,
          local:
            prevDocumentState.local &&
            timestamp &&
            new Date(timestamp).getTime() > new Date(prevDocumentState.local._updatedAt).getTime()
              ? Object.assign({...prevDocumentState.local}, {_updatedAt: timestamp})
              : prevDocumentState.local,
        },
      },
    }
  }

  let working = {
    ...prev.applied[0]?.working,
    ...prev.outgoing[0]?.working,
    [documentId]: document,
  }
  const nextApplied: AppliedTransaction[] = []
  const nextOutgoing: OutgoingTransaction[] = []

  for (const t of prev.applied) {
    const next = applyActionsFromBase({...t, working})
    working = next.working
    nextApplied.push({...t, ...next})
  }
  for (const t of prev.outgoing) {
    const next = applyActionsFromBase({...t, working})
    working = next.working
    nextOutgoing.push({...t, ...next})
  }

  return {
    ...prev,
    applied: nextApplied,
    outgoing: nextOutgoing,
    documents: {
      ...prev.documents,
      [documentId]: {
        ...prevDocumentState,
        base: document,
        baseRev: revision,
        local: working[documentId],
        unverifiedTransactions:
          revision && transactionToVerify
            ? omit(prevDocumentState.unverifiedTransactions, revision)
            : prevDocumentState.unverifiedTransactions,
      },
    },
  }
}
