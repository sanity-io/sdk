import {type SanityClient} from '@sanity/client'
import {distinctUntilChanged, filter, first, firstValueFrom, map, race} from 'rxjs'

import {createAction} from '../resources/createAction'
import {type DocumentAction} from './actions'
import {documentStore} from './documentStore'
import {type DocumentSet} from './processMutations'
import {type AppliedTransaction, type QueuedTransaction, queueTransaction} from './reducers'

export interface ActionResult {
  transactionId: string
  documents: DocumentSet
  previous: DocumentSet
  previousRevs: {[TDocumentId in string]?: string}
  submitted: () => ReturnType<SanityClient['action']>
}

export const applyActions = createAction(documentStore, ({state}) => {
  const {events} = state.get()

  return async function (action: DocumentAction | DocumentAction[]): Promise<ActionResult> {
    const actions = Array.isArray(action) ? action : [action]

    const transactionId = crypto.randomUUID()
    const transaction: QueuedTransaction = {
      transactionId,
      actions,
    }

    const transactionError$ = events.pipe(
      filter((e) => e.type === 'error'),
      filter((e) => e.transactionId === transactionId),
      first(),
    )

    const appliedTransaction$ = state.observable.pipe(
      map((s) => s.applied),
      distinctUntilChanged(),
      map((applied) => applied.find((t) => t.transactionId === transactionId)),
      filter(Boolean),
      first(),
    )

    const successfulTransaction$ = events.pipe(
      filter((e) => e.type === 'accepted'),
      filter((e) => e.outgoing.consumedTransactions.includes(transactionId)),
      first(),
    )

    const rejectedTransaction$ = events.pipe(
      filter((e) => e.type === 'reverted'),
      filter((e) => e.outgoing.consumedTransactions.includes(transactionId)),
      first(),
    )

    const appliedTransactionOrError = firstValueFrom(race([transactionError$, appliedTransaction$]))
    const acceptedOrRejectedTransaction = firstValueFrom(
      race([successfulTransaction$, rejectedTransaction$, transactionError$]),
    )

    state.set('queueTransaction', (prev) => queueTransaction(prev, transaction))

    const result = await appliedTransactionOrError
    if ('type' in result && result.type === 'error') throw result.error

    const {working: documents, previous, previousRevs} = result as AppliedTransaction

    async function submitted() {
      const raceResult = await acceptedOrRejectedTransaction
      if (raceResult.type !== 'accepted') throw raceResult.error
      return raceResult.result
    }

    return {
      transactionId,
      documents,
      previous,
      previousRevs,
      submitted,
    }
  }
})
