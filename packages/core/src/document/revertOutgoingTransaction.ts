import {omit} from 'lodash-es'

import {applyActionsFromBase} from './applyActionsFromBase'
import {
  type AppliedTransaction,
  type DocumentState,
  type OutgoingTransaction,
  type SyncTransactionState,
} from './documentStore'

interface RevertOutgoingTransactionOptions extends SyncTransactionState {
  transactionId: string
}

export function revertOutgoingTransaction({
  transactionId,
  ...prev
}: RevertOutgoingTransactionOptions): SyncTransactionState {
  let working = Object.fromEntries(
    Object.entries(prev.documents).map(([documentId, documentState]) => [
      documentId,
      documentState?.base,
    ]),
  )
  const nextApplied: AppliedTransaction[] = []
  const nextOutgoing: OutgoingTransaction[] = []

  for (const t of prev.applied) {
    const next = applyActionsFromBase({...t, working})
    working = next.working
    nextApplied.push({...t, ...next})
  }
  for (const t of prev.outgoing.filter((i) => i.transactionId !== transactionId)) {
    const next = applyActionsFromBase({...t, working})
    working = next.working
    nextOutgoing.push({...t, ...next})
  }

  return {
    ...prev,
    applied: nextApplied,
    outgoing: nextOutgoing,
    documents: Object.fromEntries(
      Object.entries(prev.documents)
        .filter((e): e is [string, DocumentState] => !!e[1])
        .map(([documentId, {unverifiedTransactions, local, ...documentState}]) => {
          const next: DocumentState = {
            ...documentState,
            local: documentId in working ? working[documentId] : local,
            unverifiedTransactions:
              transactionId in unverifiedTransactions
                ? omit(unverifiedTransactions, transactionId)
                : unverifiedTransactions,
          }
          return [documentId, next] as const
        }),
    ),
  }
}
