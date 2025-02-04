import {type SanityClient} from '@sanity/client'
import {distinctUntilChanged, filter, first, firstValueFrom, map, race} from 'rxjs'

import {createAction} from '../resources/createAction'
import {type DocumentAction} from './actions'
import {type DocumentSet} from './applyMutations'
import {type AppliedTransaction, documentStore, type QueuedTransaction} from './documentStore'

export interface ActionResult {
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
      filter((e) => e.transactionId === transactionId),
      filter((e) => e.type === 'error'),
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
      filter((e) => e.type === 'submitted'),
      filter((e) => e.consumedTransactions.includes(transactionId)),
      first(),
    )

    const rejectedTransaction$ = events.pipe(
      filter((e) => e.type === 'reverted'),
      filter((e) => e.consumedTransactions.includes(transactionId)),
      first(),
    )

    const appliedTransactionOrError = firstValueFrom(race([transactionError$, appliedTransaction$]))
    const acceptedOrRejectedTransaction = firstValueFrom(
      race([successfulTransaction$, rejectedTransaction$, transactionError$]),
    )

    state.set('queueTransaction', (prev) => ({
      queued: [...prev.queued, transaction],
    }))

    const result = await appliedTransactionOrError
    if ('type' in result && result.type === 'error') throw result.error

    const {working: documents, previous, previousRevs} = result as AppliedTransaction

    async function submitted() {
      const raceResult = await acceptedOrRejectedTransaction
      if (raceResult.type !== 'submitted') throw raceResult.error
      return raceResult.result
    }

    return {
      documents,
      previous,
      previousRevs,
      submitted,
    }
  }
})
