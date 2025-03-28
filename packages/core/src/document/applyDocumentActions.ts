import {type SanityClient} from '@sanity/client'
import {type SanityDocument} from '@sanity/types'
import {distinctUntilChanged, filter, first, firstValueFrom, map, race} from 'rxjs'

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
   * Optionally provide an ID to be used as this transaction ID
   */
  transactionId?: string
  /**
   * Set this to true to prevent this action from being batched with others.
   */
  disableBatching?: boolean
}

/** @beta */
export function applyDocumentActions<TDocument extends SanityDocument>(
  instance: SanityInstance,
  action: DocumentAction<TDocument> | DocumentAction<TDocument>[],
  options?: ApplyDocumentActionsOptions,
): Promise<ActionsResult<TDocument>>
/** @beta */
export function applyDocumentActions(
  instance: SanityInstance,
  action: DocumentAction | DocumentAction[],
  options?: ApplyDocumentActionsOptions,
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
  {instance, state}: StoreContext<DocumentStoreState>,
  actionOrActions: DocumentAction | DocumentAction[],
  {transactionId = crypto.randomUUID(), disableBatching}: ApplyDocumentActionsOptions = {},
): Promise<ActionsResult> {
  const actions = Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions]

  let projectId
  let dataset
  for (const action of actions) {
    if (action.projectId) {
      if (!projectId) projectId = action.projectId
      if (action.projectId !== projectId) {
        throw new Error(
          `Mismatched project IDs found in actions. All actions must belong to the same project. Found "${action.projectId}" but expected "${projectId}".`,
        )
      }

      if (action.dataset) {
        if (!dataset) dataset = action.dataset
        if (action.dataset !== dataset) {
          throw new Error(
            `Mismatched datasets found in actions. All actions must belong to the same dataset. Found "${action.dataset}" but expected "${dataset}".`,
          )
        }
      }
    }
  }

  if (
    (projectId && projectId !== instance.config.projectId) ||
    (dataset && dataset !== instance.config.dataset)
  ) {
    const matchedInstance = instance.match({projectId, dataset})
    if (!matchedInstance) {
      throw new Error(
        `Could not find a matching instance for projectId: "${projectId}" and dataset: "${dataset}"`,
      )
    }
    return boundApplyDocumentActions(matchedInstance, actionOrActions, {
      disableBatching,
      transactionId,
    })
  }

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
