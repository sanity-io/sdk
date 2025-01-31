import {applyActionsFromBase} from './applyActionsFromBase'
import {type DocumentSet} from './applyMutations'
import {
  type AppliedTransaction,
  type DocumentState,
  type QueuedTransaction,
  type SyncTransactionState,
} from './documentStore'

interface ApplyTransactionOptions extends SyncTransactionState {
  working: DocumentSet
  transaction: QueuedTransaction
}
export function applyTransaction({
  transaction,
  ...prev
}: ApplyTransactionOptions): SyncTransactionState {
  const {working, ...next} = applyActionsFromBase({
    ...transaction,
    working: prev.working,
    base: prev.working,
  })
  const appliedTransaction: AppliedTransaction = {
    ...transaction,
    base: prev.working,
    working,
    previous: prev.working,
    ...next,
  }

  return {
    outgoing: prev.outgoing,
    queued: prev.queued.filter((t) => t.transactionId !== transaction.transactionId),
    applied: [...prev.applied, appliedTransaction],
    documents: Object.fromEntries(
      Object.entries(prev.documents)
        .filter((e): e is [string, DocumentState] => !!e[1])
        .map(([documentId, {local, ...documentState}]) => [
          documentId,
          {...documentState, local: documentId in working ? working[documentId] : local},
        ]),
    ),
  }
}
