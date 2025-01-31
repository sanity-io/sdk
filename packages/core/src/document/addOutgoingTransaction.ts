import {
  type DocumentState,
  type OutgoingTransaction,
  type SyncTransactionState,
  type UnverifiedDocumentTransaction,
} from './documentStore'

interface AddOutgoingTransactionOptions extends SyncTransactionState {
  transaction: OutgoingTransaction
}

export function addOutgoingTransaction({
  transaction,
  ...prev
}: AddOutgoingTransactionOptions): SyncTransactionState {
  const {transactionId, previousRevs, consumedTransactions} = transaction
  return {
    ...prev,
    outgoing: [...prev.outgoing, transaction],
    applied: prev.applied.filter((i) => !consumedTransactions.includes(i.transactionId)),
    documents: {
      ...prev.documents,
      ...Object.fromEntries(
        Object.entries(previousRevs)
          .map(([documentId, previousRev]) => ({
            documentId,
            previousRev,
            documentState: prev.documents[documentId],
          }))
          .filter(
            (e): e is {documentId: string; documentState: DocumentState; previousRev: string} =>
              !!e.documentState && !!e.previousRev,
          )
          .map(({documentId, documentState, previousRev}): [string, DocumentState] => {
            const unverifiedTransaction: UnverifiedDocumentTransaction = {
              documentId,
              previousRev,
              transactionId,
            }

            if (documentState.local?._rev === previousRev) {
              return [documentId, documentState]
            }

            return [
              documentId,
              {
                ...documentState,
                unverifiedTransactions: {
                  ...documentState.unverifiedTransactions,
                  [transactionId]: unverifiedTransaction,
                },
              },
            ]
          }),
      ),
    },
  }
}
