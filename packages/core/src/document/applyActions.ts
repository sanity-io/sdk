import {type SanityClient} from '@sanity/client'
import {type SanityDocument} from '@sanity/types'
import {distinctUntilChanged, filter, first, firstValueFrom, map, race} from 'rxjs'

import {type SanityInstance} from '../instance/types'
import {type ActionContext, createAction} from '../resources/createAction'
import {type DocumentAction} from './actions'
import {documentStore, type DocumentStoreState} from './documentStore'
import {type DocumentSet} from './processMutations'
import {type AppliedTransaction, type QueuedTransaction, queueTransaction} from './reducers'

export interface ActionResult<TDocument extends SanityDocument = SanityDocument> {
  transactionId: string
  documents: DocumentSet<TDocument>
  previous: DocumentSet<TDocument>
  previousRevs: {[documentId: string]: string | undefined}
  appeared: string[]
  updated: string[]
  disappeared: string[]
  submitted: () => ReturnType<SanityClient['action']>
}

export interface ApplyActionsOptions {
  /**
   * Optionally provide an ID to be used as this transaction ID
   */
  transactionId?: string
  disableBatching?: boolean
}

const _applyActions = createAction(documentStore, ({state}) => {
  const {events} = state.get()

  return async function (
    action: DocumentAction | DocumentAction[],
    {transactionId = crypto.randomUUID(), disableBatching}: ApplyActionsOptions = {},
  ): Promise<ActionResult> {
    const actions = Array.isArray(action) ? action : [action]

    const transaction: QueuedTransaction = {
      transactionId,
      actions,
      ...(disableBatching && {disableBatching}),
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
      filter((e) => e.outgoing.batchedTransactionIds.includes(transactionId)),
      first(),
    )

    const rejectedTransaction$ = events.pipe(
      filter((e) => e.type === 'reverted'),
      filter((e) => e.outgoing.batchedTransactionIds.includes(transactionId)),
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
    const existingIds = new Set(
      Object.entries(previous)
        .filter(([, value]) => !!value)
        .map(([key]) => key),
    )
    const resultingIds = new Set(
      Object.entries(documents)
        .filter(([, value]) => !!value)
        .map(([key]) => key),
    )
    const allIds = new Set([...existingIds, ...resultingIds])

    const updated: string[] = []
    const appeared: string[] = []
    const disappeared: string[] = []

    for (const id of allIds) {
      if (existingIds.has(id) && resultingIds.has(id)) {
        updated.push(id)
      } else if (!existingIds.has(id) && resultingIds.has(id)) {
        appeared.push(id)
      } else if (!resultingIds.has(id) && existingIds.has(id)) {
        disappeared.push(id)
      }
    }

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
      appeared,
      updated,
      disappeared,
      submitted,
    }
  }
})

export function applyActions<TDocument extends SanityDocument>(
  instance: SanityInstance | ActionContext<DocumentStoreState>,
  action: DocumentAction<TDocument> | DocumentAction<TDocument>[],
  options?: ApplyActionsOptions,
): Promise<ActionResult<TDocument>>
export function applyActions(
  instance: SanityInstance | ActionContext<DocumentStoreState>,
  action: DocumentAction | DocumentAction[],
  options?: ApplyActionsOptions,
): Promise<ActionResult>
export function applyActions(
  ...args: Parameters<typeof _applyActions>
): ReturnType<typeof _applyActions> {
  return _applyActions(...args)
}
