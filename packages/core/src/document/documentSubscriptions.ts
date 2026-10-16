import {omitProperty} from '../utils/object'
import {UNVERIFIED_REVISION_RETENTION_TIME} from './documentConstants'
import {type DocumentState, type DocumentStoreState} from './documentStore'

type SubscriptionState = Pick<DocumentStoreState, 'documentStates'>

export function addSubscriptionIdToDocument<State extends SubscriptionState>(
  prev: State,
  documentId: string,
  subscriptionId: string,
): State {
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

export function removeSubscriptionIdFromDocument<State extends SubscriptionState>(
  prev: State,
  documentId: string,
  subscriptionId: string,
): State {
  const prevDocState = prev.documentStates?.[documentId]
  if (!prevDocState) return prev

  const subscriptions = prevDocState.subscriptions.filter((id) => id !== subscriptionId)

  // a document with no subscribers left is normally evicted below, but if a
  // transaction was just submitted for it, its echo-recognition memory
  // (`unverifiedRevisions`) is still waiting on the listener echo.
  // `cleanupOutgoingTransaction` removes the outgoing transaction's own
  // subscription right at HTTP ack, before the echo arrives, so deleting the
  // state here would lose that memory and make the echo mislabel as
  // `origin: 'remote'` (or, worse, get skipped outright). keep the state
  // alive, unsubscribed, until the echo verifies or the wait expires
  if (!subscriptions.length && !isAwaitingOwnEcho(prevDocState)) {
    return {...prev, documentStates: omitProperty(prev.documentStates, documentId)}
  }

  return {
    ...prev,
    documentStates: {
      ...prev.documentStates,
      [documentId]: {...prevDocState, subscriptions},
    },
  }
}

/**
 * Whether this document still expects the listener echo of one of its own
 * submitted transactions. That expectation is the only reason a document state
 * with no subscribers is kept around.
 *
 * Revisions stop counting after `UNVERIFIED_REVISION_RETENTION_TIME` because an
 * echo is not guaranteed to arrive at all: Content Lake records no transaction
 * when every operation resolves to a no-op (e.g. a keyed path that no longer
 * exists), while the client bumps `_rev` regardless and so tracks a revision
 * for it. Without the expiry, such a document (and the listener keyed off its
 * state) would be pinned for the lifetime of the store.
 *
 * `recentOwnTransactionIds` deliberately does not extend the wait: it is capped
 * rather than drained, so honoring it would keep every edited document alive.
 */
export function isAwaitingOwnEcho(documentState: DocumentState): boolean {
  const expiresAfter = Date.now() - UNVERIFIED_REVISION_RETENTION_TIME
  return Object.values(documentState.unverifiedRevisions ?? {}).some(
    (revision) => !!revision && new Date(revision.timestamp).getTime() > expiresAfter,
  )
}

/**
 * Removes every document state that has no subscribers left and no own
 * transaction still awaiting its echo.
 *
 * This is a sweep rather than a decision made where the last subscriber leaves
 * because `removeSubscriptionIdFromDocument` defers that eviction while an echo
 * is in flight, and both halves of the condition can change without a
 * subscriber going anywhere: the echo can verify, be dropped by a sync, be
 * discarded by a revert, or simply never arrive. Every reducer that can settle
 * an in-flight transaction sweeps, so the deferred decision is always re-made.
 *
 * Note this can evict the very document whose remote event is being processed,
 * which synchronously unsubscribes that document's listener from inside its own
 * emission (see `subscribeToSubscriptionsAndListenToDocuments`).
 */
export function evictOrphanedDocumentStates(
  documentStates: SubscriptionState['documentStates'],
): SubscriptionState['documentStates'] {
  let next = documentStates
  for (const [documentId, documentState] of Object.entries(documentStates)) {
    if (!documentState) continue
    if (documentState.subscriptions.length) continue
    if (isAwaitingOwnEcho(documentState)) continue
    next = omitProperty(next, documentId)
  }
  return next
}
