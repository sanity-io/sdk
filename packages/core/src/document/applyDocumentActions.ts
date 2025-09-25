import {type SanityClient} from '@sanity/client'
import {type SanityDocument} from 'groq'
import {distinctUntilChanged, filter, first, firstValueFrom, map, race} from 'rxjs'

import {type DocumentSource} from '../config/sanityConfig'
import {bindActionByDataset} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StoreContext} from '../store/defineStore'
import {type DocumentAction} from './actions'
import {documentStore, type DocumentStoreState} from './documentStore'
import {type DocumentSet} from './processMutations'
import {type AppliedTransaction, type QueuedTransaction, queueTransaction} from './reducers'

/** @beta */
export interface ActionsResult<TDocument extends SanityDocument = SanityDocument> {
  transactionId: string
  documents: DocumentSet<TDocument>
  previous: DocumentSet<TDocument>
  previousRevs: {[documentId: string]: string | undefined}
  appeared: string[]
  updated: string[]
  disappeared: string[]
  submitted: () => ReturnType<SanityClient['action']>
}

/** @beta */
export interface ApplyDocumentActionsOptions {
  /**
   * List of actions to apply.
   */
  actions: DocumentAction[]

  /**
   * Optionally provide an ID to be used as this transaction ID
   */
  transactionId?: string
  /**
   * Set this to true to prevent this action from being batched with others.
   */
  disableBatching?: boolean

  /**
   * The source to apply to.
   */
  source: DocumentSource
}

/** @beta */
export function applyDocumentActions<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  options: ApplyDocumentActionsOptions,
): Promise<ActionsResult<SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>>>
/** @beta */
export function applyDocumentActions(
  instance: SanityInstance,
  options: ApplyDocumentActionsOptions,
): Promise<ActionsResult>

/** @beta */
export function applyDocumentActions(
  ...args: Parameters<typeof boundApplyDocumentActions>
): ReturnType<typeof boundApplyDocumentActions> {
  return boundApplyDocumentActions(...args)
}

const boundApplyDocumentActions = bindActionByDataset(documentStore, _applyDocumentActions)

/** @internal */
async function _applyDocumentActions(
  {state}: StoreContext<DocumentStoreState>,
  {actions, transactionId = crypto.randomUUID(), disableBatching}: ApplyDocumentActionsOptions,
): Promise<ActionsResult> {
  const {events} = state.get()

  const transaction: QueuedTransaction = {
    transactionId,
    actions,
    ...(disableBatching && {disableBatching}),
  }

  const fatalError$ = state.observable.pipe(
    map((s) => s.error),
    first(Boolean),
    map((error) => ({type: 'error', error}) as const),
  )

  const transactionError$ = events.pipe(
    filter((e) => e.type === 'error'),
    first((e) => e.transactionId === transactionId),
  )

  const appliedTransaction$ = state.observable.pipe(
    map((s) => s.applied),
    distinctUntilChanged(),
    map((applied) => applied.find((t) => t.transactionId === transactionId)),
    first(Boolean),
  )

  const successfulTransaction$ = events.pipe(
    filter((e) => e.type === 'accepted'),
    first((e) => e.outgoing.batchedTransactionIds.includes(transactionId)),
  )

  const rejectedTransaction$ = events.pipe(
    filter((e) => e.type === 'reverted'),
    first((e) => e.outgoing.batchedTransactionIds.includes(transactionId)),
  )

  const appliedTransactionOrError = firstValueFrom(
    race([fatalError$, transactionError$, appliedTransaction$]),
  )
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
