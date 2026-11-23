import {type Action as ClientAction, type SanityClient} from '@sanity/client'
import {diffValue} from '@sanity/diff-patch'
import {
  createDocumentSync,
  type DocumentSync,
  type DroppedEdit,
  type ListenEvent,
  type PatchOps,
  type Transport,
} from '@sanity/document-sync'
import {DocumentId, getDraftId, getPublishedId, isDraftId, isVersionId} from '@sanity/id-utils'
import {type PatchOperations} from '@sanity/types'
import {distinctUntilChanged, filter, firstValueFrom, forkJoin, map, type Subscription} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type DocumentHandle} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type BoundResourceKey} from '../store/createActionBinder'
import {type StoreContext} from '../store/defineStore'
import {type ResolveDocument} from '../typegen/resolve'
import {type Action, type EditDocumentAction} from './actions'
import {API_VERSION} from './documentConstants'
import {type DocumentStoreState} from './documentStore'
import {type DocumentTransactionSubmissionResult, getDocumentEvents} from './events'
import {processActions} from './processActions/processActions'
import {preserveNumericOperations} from './processActions/shared'
import {type DocumentSet, processMutations} from './processMutations'
import {type HttpAction, type OutgoingTransaction} from './reducers'
import {classifySubmissionError} from './submissionErrors'

// Prototype for `experimental_documentSync`: one `@sanity/document-sync` engine per document
// (published plus draft), kept in `DocumentStoreState.engines` by published id.

/** An engine transaction as the SDK sent it, for the document events. */
export interface EngineTransaction {
  /** The SDK action the engine transaction carries. */
  action: Action
  /** The transaction id the caller passed to `applyDocumentActions`. */
  callerTransactionId: string
  /** The engine's local documents before and after the action. */
  previous: DocumentSet
  working: DocumentSet
  /** Submissions that failed and will be retried, for `submission-failed`'s `attempt`. */
  failedAttempts: number
}

/**
 * The engine's transport over the store's own connections: snapshots from `fetchDocument`,
 * events from the shared listener (one connection for every document), and writes through
 * the Actions API.
 */
function createStoreTransport(
  context: StoreContext<DocumentStoreState, BoundResourceKey>,
): Transport {
  const {state, instance, key} = context
  const {sharedListener, fetchDocument} = state.get()
  const client$ = getClientState(instance, {
    apiVersion: API_VERSION,
    resource: key.resource,
  }).observable
  return {
    fetch: (ids) => firstValueFrom(forkJoin(ids.map((id) => fetchDocument(id)))),
    listen(ids, onEvent) {
      const subscription = sharedListener.events
        .pipe(filter((event) => event.type !== 'mutation' || ids.includes(event.documentId)))
        .subscribe((event) => onEvent(event as ListenEvent))
      return () => subscription.unsubscribe()
    },
    submit: async ({transactionId, actions}) => {
      const client: SanityClient = await firstValueFrom(client$)
      let result
      try {
        result = await client.action(actions as ClientAction[], {
          transactionId,
          skipCrossDatasetReferenceValidation: true,
          tag: 'document.action',
        })
      } catch (error) {
        emitSubmitFailed(state.get(), transactionId, actions as HttpAction[], error)
        throw error
      }
      emitAccepted(state.get(), transactionId, actions as HttpAction[], result)
    },
  }
}

/** The engine transaction as the queue's `OutgoingTransaction`, the shape the events carry. */
function engineOutgoing(
  {action, callerTransactionId, previous, working}: EngineTransaction,
  transactionId: string,
  outgoingActions: HttpAction[],
): OutgoingTransaction {
  return {
    transactionId,
    actions: [action],
    // The caller's id, so code that waits on its own transaction id finds this one.
    batchedTransactionIds: [callerTransactionId],
    disableBatching: false,
    previous,
    working,
    base: previous,
    previousRevs: Object.fromEntries(Object.entries(previous).map(([id, doc]) => [id, doc?._rev])),
    timestamp: new Date().toISOString(),
    outgoingActions,
    outgoingMutations: [],
  }
}

/**
 * Emits the per-document events and `accepted` for an engine transaction the server accepted.
 * @internal
 */
export function emitAccepted(
  {engineTransactions, events}: DocumentStoreState,
  transactionId: string,
  outgoingActions: HttpAction[],
  result: DocumentTransactionSubmissionResult,
): void {
  const transaction = engineTransactions.get(transactionId)
  if (!transaction) return
  engineTransactions.delete(transactionId)
  const outgoing = engineOutgoing(transaction, transactionId, outgoingActions)
  for (const event of getDocumentEvents(outgoing)) events.next(event)
  events.next({type: 'accepted', outgoing, result})
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Request failed')

/**
 * Emits the events for a failed submission, classified as the queue does: a retry is a
 * `submission-failed`, and a resend of a transaction that already landed is an ack. A rejection
 * is reported when the engine drops the transaction (`emitDropped`).
 * @internal
 */
export function emitSubmitFailed(
  state: DocumentStoreState,
  transactionId: string,
  outgoingActions: HttpAction[],
  error: unknown,
): void {
  const transaction = state.engineTransactions.get(transactionId)
  if (!transaction) return
  const kind = classifySubmissionError(error)
  if (kind === 'accepted') {
    emitAccepted(state, transactionId, outgoingActions, {
      transactionId,
      documentIds: [],
      results: [],
    })
  } else if (kind === 'retry') {
    transaction.failedAttempts++
    state.events.next({
      type: 'submission-failed',
      message: errorMessage(error),
      error,
      outgoing: engineOutgoing(transaction, transactionId, outgoingActions),
      attempt: transaction.failedAttempts,
    })
  }
}

/**
 * Emits `reverted` for an engine transaction the server rejected and the engine dropped.
 * @internal
 */
export function emitDropped(
  {engineTransactions, events}: DocumentStoreState,
  dropped: DroppedEdit,
): void {
  if (dropped.reason !== 'rejected') return
  const {transactionId, actions} = dropped.transaction
  const transaction = engineTransactions.get(transactionId)
  if (!transaction) return
  engineTransactions.delete(transactionId)
  const outgoing = engineOutgoing(transaction, transactionId, actions as HttpAction[])
  events.next({
    type: 'reverted',
    message: errorMessage(dropped.error),
    error: dropped.error,
    outgoing,
  })
}

/** Published ids of the documents with subscribers, leaving out release versions. */
function enginePublishedIds(documentStates: DocumentStoreState['documentStates']): string[] {
  const ids = Object.keys(documentStates).filter((id) => !isVersionId(DocumentId(id)))
  return [
    ...new Set(ids.map((id) => (isDraftId(DocumentId(id)) ? getPublishedId(DocumentId(id)) : id))),
  ]
}

/**
 * Keeps one engine per subscribed document while `experimental_documentSync` is on. Each engine
 * change bumps `engineChanges`, so selectors that read the engine run again.
 */
export function subscribeToSubscriptionsAndRunEngines(
  context: StoreContext<DocumentStoreState, BoundResourceKey>,
): Subscription {
  const {state, instance} = context
  const transport = createStoreTransport(context)
  const cleanups = new Map<string, () => void>()
  const subscription = state.observable
    .pipe(
      filter(() => !!instance.config.experimental_documentSync),
      map((s) => enginePublishedIds(s.documentStates).sort().join(',')),
      distinctUntilChanged(),
    )
    .subscribe((joined) => {
      const ids = joined ? joined.split(',') : []
      for (const id of ids) {
        if (cleanups.has(id)) continue
        const sync = createDocumentSync({documentId: id, transport})
        const unsubscribe = sync.subscribe(() => {
          state.set('engineChanged', (prev) => ({engineChanges: prev.engineChanges + 1}))
        })
        const unsubscribeDropped = sync.onDropped((dropped) => emitDropped(state.get(), dropped))
        cleanups.set(id, () => {
          unsubscribe()
          unsubscribeDropped()
          sync.dispose()
        })
        state.set('addEngine', (prev) => ({engines: {...prev.engines, [id]: sync}}))
      }
      for (const [id, cleanup] of cleanups) {
        if (ids.includes(id)) continue
        cleanup()
        cleanups.delete(id)
        state.set('removeEngine', (prev) => {
          const {[id]: _removed, ...engines} = prev.engines
          return {engines}
        })
      }
    })
  subscription.add(() => cleanups.forEach((cleanup) => cleanup()))
  return subscription
}

/** The ready engine for a handle's document, or `undefined` when the engine does not handle it. */
export function engineForHandle(
  state: DocumentStoreState,
  handle: Pick<DocumentHandle, 'documentId' | 'liveEdit' | 'perspective'>,
): DocumentSync | undefined {
  // The engine handles a published document and its draft; liveEdit and release versions stay
  // on the transaction queue.
  if (handle.liveEdit || isReleasePerspective(handle.perspective)) return undefined
  if (!queueHasLoaded(state, handle.documentId) || queueOwnsDocument(state, handle.documentId))
    return undefined
  const engine = state.engines[getPublishedId(DocumentId(handle.documentId))]
  return engine?.remote() === undefined ? undefined : engine
}

/**
 * Whether the transaction queue could apply an action to the document right now: grants and both
 * the published and draft documents are loaded. Until then the engine does not serve the document
 * either, so a write made in that window queues behind the same load in both modes.
 */
function queueHasLoaded(state: DocumentStoreState, documentId: string): boolean {
  const publishedId = getPublishedId(DocumentId(documentId))
  const draftId = getDraftId(DocumentId(documentId))
  return (
    !!state.grants &&
    state.documentStates[publishedId]?.local !== undefined &&
    state.documentStates[draftId]?.local !== undefined
  )
}

/**
 * Whether the transaction queue has a transaction for the document (published or draft) that it
 * has not finished. While it does, the queue owns the document: reads and writes stay there, so
 * they see its optimistic state and keep their order.
 */
function queueOwnsDocument(state: DocumentStoreState, documentId: string): boolean {
  const publishedId = getPublishedId(DocumentId(documentId))
  const touches = (action: Action) =>
    'documentId' in action &&
    typeof action.documentId === 'string' &&
    !isReleasePerspective(action.perspective) &&
    getPublishedId(DocumentId(action.documentId)) === publishedId
  const unfinished = [
    ...state.queued,
    ...state.applied,
    ...(state.outgoing ? [state.outgoing] : []),
  ]
  return unfinished.some((transaction) => transaction.actions.some(touches))
}

/** The engine's local view for a handle, or `undefined` when the engine does not handle it. */
export function engineLocalDocument(
  state: DocumentStoreState,
  handle: Pick<DocumentHandle, 'documentId' | 'liveEdit' | 'perspective'>,
): ResolveDocument | null | undefined {
  const engine = engineForHandle(state, handle)
  return engine ? (engine.local() as ResolveDocument | null) : undefined
}

/**
 * The patches the engine sends for an edit. As on the transaction queue, they are re-derived by
 * diffing the local view before and after the edit, so a whole-value `set` of a string goes out
 * as a `diffMatchPatch` and merges with other writers' edits. `preserveOperations` sends the
 * patches as given.
 */
function editPatches(engine: DocumentSync, action: EditDocumentAction): PatchOps[] {
  const patches = action.patches ?? []
  const local = engine.local()
  if (action.preserveOperations || !local) return patches as PatchOps[]
  const draftId = getDraftId(DocumentId(action.documentId))
  const before = {...local, _id: draftId}
  const after = processMutations({
    documents: {[draftId]: before},
    mutations: patches.map((patch) => ({patch: {...patch, id: draftId}})),
    transactionId: before._rev ?? '',
  })[draftId]
  const diffed = diffValue(before, after) as PatchOperations[]
  return preserveNumericOperations(before, patches, diffed) as PatchOps[]
}

const engineActionTypes = [
  'document.create',
  'document.edit',
  'document.publish',
  'document.unpublish',
  'document.discard',
  'document.delete',
] as const
type EngineAction = Extract<Action, {type: (typeof engineActionTypes)[number]}>

const isEngineAction = (action: Action): action is EngineAction & {documentId: string} =>
  (engineActionTypes as readonly string[]).includes(action.type) &&
  typeof (action as {documentId?: unknown}).documentId === 'string'

/** Sends one action to the engine, already checked by `checkAsQueue`. */
function sendToEngine(
  engine: DocumentSync,
  action: EngineAction & {documentId: string},
): string | undefined {
  const docs = engine.localDocuments() ?? {draft: null, published: null}
  if (action.type === 'document.create') {
    const {_id, _rev, ...base} = docs.published ?? {}
    return engine.create({...base, _type: action.documentType, ...action.initialValue})
  } else if (action.type === 'document.edit') {
    const patches = editPatches(engine, action)
    // An edit that changes nothing sends nothing, as on the transaction queue.
    return patches.length ? engine.edit(patches) : undefined
  } else {
    const send = {
      'document.publish': () => engine.publish(),
      'document.unpublish': () => engine.unpublish(),
      'document.discard': () => engine.discard(),
      'document.delete': () => engine.delete(),
    }
    return send[action.type]()
  }
}

/** The engine's local draft and published documents, by id. */
function localDocumentSet(engine: DocumentSync, documentId: string): DocumentSet {
  const {draft, published} = engine.localDocuments() ?? {draft: null, published: null}
  return {
    [getDraftId(DocumentId(documentId))]: draft,
    [getPublishedId(DocumentId(documentId))]: published,
  } as DocumentSet
}

/**
 * Checks the actions the way the transaction queue does, against the engine's local view: the
 * queue's state checks and grant checks. Throws the queue's `ActionError` or
 * `PermissionActionError` before anything reaches the engine.
 */
function checkAsQueue(
  {grants, identity}: DocumentStoreState,
  engine: DocumentSync,
  actions: Action[],
  transactionId: string,
): void {
  if (!grants) return
  const [leading] = actions as (EngineAction & {documentId: string})[]
  const documents = localDocumentSet(engine, leading!.documentId)
  processActions({
    actions,
    transactionId,
    base: documents,
    working: documents,
    timestamp: new Date().toISOString(),
    grants,
    identity,
  })
}

/**
 * Sends the actions through a document's engine when it can take all of them: creates, edits,
 * publishes, unpublishes, discards and deletes of one document the engine handles. Returns the
 * engine, the document's handle and its local view from before the actions, or `undefined` to use
 * the transaction queue. Each action goes out as its own engine transaction.
 */
export function applyWithEngine(
  state: DocumentStoreState,
  actions: Action[],
  transactionId: string,
):
  | {
      engine: DocumentSync
      handle: DocumentHandle
      previous: ResolveDocument | null
      /** The ids of the engine transactions the actions went out as. */
      transactionIds: string[]
    }
  | undefined {
  const [leading] = actions
  if (!leading || !isEngineAction(leading)) return undefined
  const publishedId = getPublishedId(DocumentId(leading.documentId))
  const sameDocument = actions.every(
    (action) =>
      isEngineAction(action) && getPublishedId(DocumentId(action.documentId)) === publishedId,
  )
  const engine = sameDocument ? engineForHandle(state, leading) : undefined
  if (!engine) return undefined
  const previous = engine.local() as ResolveDocument | null
  checkAsQueue(state, engine, actions, transactionId)
  const transactionIds: string[] = []
  for (const action of actions as (EngineAction & {documentId: string})[]) {
    const before = localDocumentSet(engine, action.documentId)
    const engineTransactionId = sendToEngine(engine, action)
    if (!engineTransactionId) continue
    transactionIds.push(engineTransactionId)
    state.engineTransactions.set(engineTransactionId, {
      action,
      callerTransactionId: transactionId,
      failedAttempts: 0,
      previous: before,
      working: localDocumentSet(engine, action.documentId),
    })
  }
  return {engine, handle: leading, previous, transactionIds}
}
