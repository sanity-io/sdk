import {DocumentId, getDraftId} from '@sanity/id-utils'
import {distinctUntilChanged, filter, first, firstValueFrom, map, race} from 'rxjs'

import {type DocumentResource} from '../config/sanityConfig'
import {bindActionByResource} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StoreContext} from '../store/defineStore'
import {type ResolveDocument} from '../typegen/resolve'
import {randomUuid} from '../utils/ids'
import {type Action} from './actions'
import {documentStore, type DocumentStoreState, getStoreError} from './documentStore'
import {applyWithEngine} from './engineDocuments'
import {type DocumentTransactionSubmissionResult} from './events'
import {type DocumentSet} from './processMutations'
import {type AppliedTransaction, type QueuedTransaction, queueTransaction} from './reducers'
import {normalizeActionsForResource} from './resourceRules'

/** @beta */
export interface ActionsResult<TDocument extends ResolveDocument = ResolveDocument> {
  transactionId: string
  documents: DocumentSet<TDocument>
  previous: DocumentSet<TDocument>
  previousRevs: {[documentId: string]: string | undefined}
  appeared: string[]
  updated: string[]
  disappeared: string[]
  submitted: () => Promise<DocumentTransactionSubmissionResult>
}

/** @beta */
export interface ApplyDocumentActionsOptions {
  /**
   * List of actions to apply. Accepts both document actions and release
   * lifecycle actions because they share the same transaction pipeline.
   */
  actions: Action[]

  /**
   * The resource to which the documents being acted on belong.
   */
  resource?: DocumentResource

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
export function applyDocumentActions<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  options: ApplyDocumentActionsOptions,
): Promise<ActionsResult<ResolveDocument<TDocumentType, `${TProjectId}.${TDataset}`>>>
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

const boundApplyDocumentActions = bindActionByResource(documentStore, applyThroughEngineOrQueue)

// `experimental_documentSync` prototype: a document's engine takes the actions it can handle,
// and the rest go to the transaction queue. The transaction id is the caller's; the engine sends
// under its own.
function applyThroughEngineOrQueue(
  context: StoreContext<DocumentStoreState>,
  options: ApplyDocumentActionsOptions,
): Promise<ActionsResult> {
  const {actions, resource, transactionId = randomUuid()} = options
  let routed
  try {
    routed = applyWithEngine(
      context.state.get(),
      normalizeActionsForResource(actions, resource),
      transactionId,
    )
  } catch (error) {
    return Promise.reject(error)
  }
  if (routed) return Promise.resolve(engineActionsResult(routed, transactionId))
  return _applyDocumentActions(context, {...options, transactionId})
}

/**
 * Returns the result of a transaction with no actions. `batchAppliedTransactions`
 * skips empty transactions, so one that reached the queue would never be consumed
 * into an outgoing transaction: it would sit in `applied` and its `submitted()`
 * would never resolve.
 */
function emptyActionsResult(transactionId: string): ActionsResult {
  return {
    transactionId,
    documents: {},
    previous: {},
    previousRevs: {},
    appeared: [],
    updated: [],
    disappeared: [],
    submitted: async () => ({transactionId}),
  }
}

/** @internal */
function engineActionsResult(
  {engine, handle, previous: before}: NonNullable<ReturnType<typeof applyWithEngine>>,
  transactionId: string,
): ActionsResult {
  const draftId = getDraftId(DocumentId(handle.documentId))
  const previous = {[draftId]: before}
  const documents = {[draftId]: engine.local() as ResolveDocument | null}
  return {
    transactionId,
    documents,
    previous,
    previousRevs: {[draftId]: previous[draftId]?._rev},
    appeared: previous[draftId] ? [] : [draftId],
    updated: previous[draftId] ? [draftId] : [],
    disappeared: [],
    submitted: async () => {
      await engine.whenSubmitted()
      return {transactionId}
    },
  }
}

async function _applyDocumentActions(
  {state}: StoreContext<DocumentStoreState>,
  {actions, resource, transactionId = randomUuid(), disableBatching}: ApplyDocumentActionsOptions,
): Promise<ActionsResult> {
  if (!actions.length) return emptyActionsResult(transactionId)

  const {events} = state.get()

  // Rewrite edit actions to match the bound resource's editing model (e.g.
  // forcing liveEdit for Canvas, stripping unsupported release perspectives).
  // Non-edit and release actions pass through unchanged.
  const normalizedActions = normalizeActionsForResource(actions, resource)

  const transaction: QueuedTransaction = {
    transactionId,
    actions: normalizedActions,
    ...(disableBatching && {disableBatching}),
  }

  const fatalError$ = state.observable.pipe(
    map(getStoreError),
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
