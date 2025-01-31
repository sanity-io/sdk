import {type SanityClient} from '@sanity/client'
import {filter, firstValueFrom, map} from 'rxjs'

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

    state.set('queueTransaction', (prev) => ({
      queued: [...prev.queued, transaction],
    }))

    const transactionFailed = firstValueFrom(
      events.pipe(
        filter((e) => e.transactionId === transactionId),
        filter((e) => e.type === 'error'),
      ),
    )

    const transactionApplied = firstValueFrom(
      state.observable.pipe(
        map((s) => s.applied[0]),
        filter(Boolean),
        filter((t) => t.transactionId === transactionId),
      ),
    )

    const result = await Promise.race([transactionFailed, transactionApplied])
    if ('type' in result && result.type === 'error') throw result.error

    const {working: documents, previous, previousRevs} = result as AppliedTransaction

    const accepted = firstValueFrom(
      events.pipe(
        filter((e) => e.transactionId === transactionId),
        filter((e) => e.type === 'submitted'),
      ),
    )

    const rejected = firstValueFrom(
      events.pipe(
        filter((e) => e.transactionId === transactionId),
        filter((e) => e.type === 'reverted'),
      ),
    )

    async function submitted() {
      const raceResult = await Promise.race([accepted, rejected])
      if (raceResult.type === 'reverted') throw raceResult.error
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
