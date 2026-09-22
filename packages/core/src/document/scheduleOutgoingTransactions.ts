import {
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  type Observable,
  switchMap,
  tap,
  timer,
} from 'rxjs'

import {type StoreState} from '../store/createStoreState'
import {EDIT_BATCH_INTERVAL} from './documentConstants'
import {
  isBatchableTransaction,
  type OutgoingTransaction,
  type SyncTransactionState,
  transitionAppliedTransactionsToOutgoing,
} from './reducers'

/**
 * Submits the first ready transaction without a batching delay and coalesces
 * subsequent edits until the edit interval expires. A non-batchable transaction
 * flushes preceding edits without overtaking them. Only one transaction is
 * outgoing at a time; acknowledgement or reversion makes the queue eligible again.
 */
export function scheduleOutgoingTransactions(
  state: StoreState<SyncTransactionState>,
): Observable<OutgoingTransaction> {
  return defer(() => {
    let nextEditSubmissionAt = 0

    return state.observable.pipe(
      distinctUntilChanged((a, b) => a.applied === b.applied && a.outgoing === b.outgoing),
      switchMap(({applied, outgoing}) => {
        if (outgoing) return EMPTY
        const pending = applied.filter((transaction) => transaction.actions.length > 0)
        if (!pending.length) return EMPTY

        // Flush the FIFO prefix when any ready transaction requires its own
        // request. The reducer still decides which adjacent edits can be combined.
        const flush = pending.some((transaction) => !isBatchableTransaction(transaction))
        const delay = flush ? 0 : Math.max(0, nextEditSubmissionAt - Date.now())
        // Even an immediate flush uses the next scheduler turn. This avoids
        // reentrant submission while local application/acknowledgement is emitting.
        return timer(delay)
      }),
      map(() => transitionAppliedTransactionsToOutgoing(state.get())),
      filter((next) => !!next.outgoing),
      tap((next) => {
        if (!next.outgoing!.disableBatching) {
          nextEditSubmissionAt = Date.now() + EDIT_BATCH_INTERVAL
        }
        state.set('transitionAppliedTransactionsToOutgoing', next)
      }),
      map((next) => next.outgoing!),
    )
  })
}
