import {type Action as ClientAction, type SanityClient} from '@sanity/client'
import {
  createDocumentSync,
  type DocumentSync,
  type DroppedEdit,
  type ListenEvent,
  type Operation,
  type PatchOps,
  type Transport,
} from '@sanity/document-sync'
import {DocumentId, getDraftId, getPublishedId, isDraftId, isVersionId} from '@sanity/id-utils'
import {type SanityDocument} from '@sanity/types'
import {
  distinctUntilChanged,
  filter,
  first,
  firstValueFrom,
  forkJoin,
  map,
  type Observable,
  retry,
  type Subscription,
  timer,
} from 'rxjs'

import {getConfirmedUserState} from '../auth/authStore'
import {getClientState} from '../client/clientStore'
import {type DocumentHandle} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type BoundResourceKey} from '../store/createActionBinder'
import {type StoreContext} from '../store/defineStore'
import {type ResolveDocument} from '../typegen/resolve'
import {createLogger} from '../utils/logger'
import {setCleanupTimeout} from '../utils/setCleanupTimeout'
import {type Action} from './actions'
import {
  API_VERSION,
  DOCUMENT_STATE_CLEAR_DELAY,
  EDIT_BATCH_INTERVAL,
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
  SUBMISSION_RETRY_BASE_DELAY,
  SUBMISSION_RETRY_MAX_DELAY,
} from './documentConstants'
import {type DocumentStoreState} from './documentStore'
import {type DocumentTransactionSubmissionResult, getDocumentEvents} from './events'
import {processActions} from './processActions/processActions'
import {type DocumentSet} from './processMutations'
import {
  type HttpAction,
  type OutgoingTransaction,
  releaseEngineHolds,
  UserChangedError,
} from './reducers'
import {classifySubmissionError} from './submissionErrors'

// Prototype for `experimental_documentSync`: one `@sanity/document-sync` engine per document
// (published plus draft), kept in `DocumentStoreState.engines` by published id.

/** An engine transaction as the SDK sent it, for the document events. */
export interface EngineTransaction {
  /** The SDK actions the engine transaction carries. */
  actions: Action[]
  /** The transaction id the caller passed to `applyDocumentActions`. */
  callerTransactionId: string
  /** The engine's local documents before and after the action. */
  previous: DocumentSet
  working: DocumentSet
  /** Submissions that failed and will be retried, for `submission-failed`'s `attempt`. */
  failedAttempts: number
  /** The user it is sent as, as on the queue (`QueuedTransaction.author`). */
  author?: string
  /** Settles once the server accepts it (no error) or it is reverted or discarded (the error). */
  settled: Promise<{error?: unknown}>
  settle: (outcome: {error?: unknown}) => void
}

/** The published id of the document an engine transaction writes. */
const publishedIdOf = ({actions}: EngineTransaction) =>
  getPublishedId(DocumentId((actions[0] as EngineAction & {documentId: string}).documentId))

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
    // After the store is disposed the engine can still be mid-send or mid-retry. Its calls then
    // never settle: a request would bind the disposed instance to the global auth store, which
    // keeps that store, and its token, alive for every later instance.
    fetch: (ids) =>
      instance.isDisposed()
        ? new Promise(() => {})
        : firstValueFrom(forkJoin(ids.map((id) => fetchDocument(id)))),
    listen(ids, onEvent) {
      const subscription = sharedListener.events
        .pipe(
          filter((event) => event.type !== 'mutation' || ids.includes(event.documentId)),
          // As the queue's listener does: after a listener error, subscribe again, which opens a
          // new connection. Its `welcome` makes the engine fetch a fresh snapshot.
          retry({
            delay: (_error, attempt) =>
              timer(
                Math.min(
                  OUT_OF_SYNC_RETRY_BASE_DELAY * 2 ** (attempt - 1),
                  OUT_OF_SYNC_RETRY_MAX_DELAY,
                ),
              ),
          }),
        )
        .subscribe((event) => onEvent(event as ListenEvent))
      return () => subscription.unsubscribe()
    },
    submit: async ({transactionId, actions, batchedTransactionIds}) => {
      if (instance.isDisposed()) return new Promise<void>(() => {})
      // As on the queue: wait until the user for the current token is confirmed, and never send a
      // transaction as anyone but its author. Another user's transaction is dropped from the
      // engine, which reports it (`emitDropped`), and nothing is sent.
      const user = await firstValueFrom(
        getConfirmedUserState(instance).observable.pipe(first((u) => u !== undefined)),
      )
      const batch = batchOf(state.get(), transactionId, batchedTransactionIds)
      if (batch.length && user) {
        for (const t of batch) t.author ??= user.id
        if (batch.some((t) => t.author !== user.id)) {
          state.get().engines[publishedIdOf(batch[0]!)]?.discardPending([transactionId])
          return
        }
      }
      settleOnEcho(
        state.get(),
        sharedListener.events,
        transactionId,
        actions,
        batchedTransactionIds,
      )
      const client: SanityClient = await firstValueFrom(client$)
      let result
      try {
        result = await client.action(actions as ClientAction[], {
          transactionId,
          skipCrossDatasetReferenceValidation: true,
          tag: 'document.action',
        })
      } catch (error) {
        emitSubmitFailed(
          state.get(),
          transactionId,
          actions as HttpAction[],
          error,
          batchedTransactionIds,
        )
        throw error
      }
      emitAccepted(
        state.get(),
        transactionId,
        actions as HttpAction[],
        result,
        batchedTransactionIds,
      )
    },
  }
}

/**
 * Accepts a submission when the listener echoes it, until its transactions settle. When a write
 * lands but its response is lost, the engine takes the echo as confirmation and does not resend,
 * so the HTTP outcome alone would never settle `submitted()` or emit `accepted`. Whichever of the
 * response and the echo comes first emits `accepted`; the other finds no transactions left.
 * @internal
 */
export function settleOnEcho(
  state: DocumentStoreState,
  events: Observable<{type: string}>,
  transactionId: string,
  actions: unknown[],
  batchedTransactionIds?: string[],
): void {
  const batch = batchOf(state, transactionId, batchedTransactionIds)
  if (!batch.length) return
  const subscription = events
    .pipe(
      first(
        (event) =>
          event.type === 'mutation' &&
          (event as {transactionId?: string}).transactionId === transactionId,
      ),
    )
    .subscribe(() =>
      emitAccepted(
        state,
        transactionId,
        actions as HttpAction[],
        {transactionId, documentIds: [], results: []},
        batchedTransactionIds,
      ),
    )
  void Promise.all(batch.map((t) => t.settled)).then(() => subscription.unsubscribe())
}

/**
 * The recorded engine transactions behind one submission: the transaction itself, or every
 * transaction the engine merged into a batch of edits.
 */
function batchOf(
  {engineTransactions}: DocumentStoreState,
  transactionId: string,
  batchedTransactionIds: string[] = [transactionId],
): EngineTransaction[] {
  return batchedTransactionIds.flatMap((id) => engineTransactions.get(id) ?? [])
}

/** A submission as the queue's `OutgoingTransaction`, the shape the events carry. */
function engineOutgoing(
  batch: EngineTransaction[],
  transactionId: string,
  outgoingActions: HttpAction[],
): OutgoingTransaction {
  const previous = batch[0]!.previous
  return {
    transactionId,
    actions: batch.flatMap((t) => t.actions),
    // The callers' ids, so code that waits on its own transaction id finds this one.
    batchedTransactionIds: batch.map((t) => t.callerTransactionId),
    disableBatching: false,
    previous,
    working: batch.at(-1)!.working,
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
  state: DocumentStoreState,
  transactionId: string,
  outgoingActions: HttpAction[],
  result: DocumentTransactionSubmissionResult,
  batchedTransactionIds?: string[],
): void {
  const batch = batchOf(state, transactionId, batchedTransactionIds)
  if (!batch.length) return
  for (const t of batch) state.engineTransactions.delete(t.callerTransactionId)
  const outgoing = engineOutgoing(batch, transactionId, outgoingActions)
  for (const event of getDocumentEvents(outgoing)) state.events.next(event)
  state.events.next({type: 'accepted', outgoing, result})
  for (const t of batch) t.settle({})
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
  batchedTransactionIds?: string[],
): void {
  const batch = batchOf(state, transactionId, batchedTransactionIds)
  if (!batch.length) return
  const kind = classifySubmissionError(error)
  if (kind === 'accepted') {
    const result = {transactionId, documentIds: [], results: []}
    emitAccepted(state, transactionId, outgoingActions, result, batchedTransactionIds)
  } else if (kind === 'retry') {
    for (const t of batch) t.failedAttempts++
    state.events.next({
      type: 'submission-failed',
      message: errorMessage(error),
      error,
      outgoing: engineOutgoing(batch, transactionId, outgoingActions),
      attempt: batch[0]!.failedAttempts,
    })
  }
}

/**
 * Emits `reverted` for an engine transaction the server rejected and the engine dropped.
 * @internal
 */
export function emitDropped(
  state: DocumentStoreState,
  dropped: DroppedEdit,
  publishedId: string,
): void {
  if (dropped.reason === 'no-op') {
    // The transaction was accepted and its echo showed some operations changed nothing.
    const {transactionId, batchedTransactionIds} = dropped.transaction
    state.events.next({
      type: 'edit-no-op',
      documentId: getDraftId(DocumentId(publishedId)),
      transactionId,
      ...(batchedTransactionIds && {batchedTransactionIds}),
      noOps: dropped.noOps,
    })
    return
  }
  const {transactionId, actions, batchedTransactionIds} = dropped.transaction
  const batch = batchOf(state, transactionId, batchedTransactionIds)
  if (!batch.length) return
  for (const t of batch) state.engineTransactions.delete(t.callerTransactionId)
  const outgoing = engineOutgoing(batch, transactionId, actions as HttpAction[])
  // `discarded`: the engine dropped another user's transaction (see `discardOtherUsersEdits`).
  const error = dropped.reason === 'rejected' ? dropped.error : new UserChangedError()
  for (const t of batch) t.settle({error})
  state.events.next({
    type: 'reverted',
    message: errorMessage(error),
    error,
    outgoing,
  })
}

/**
 * Releases the engine's hold on a document once it has nothing pending. Deferred by the usual
 * clear delay, so the queue's listener has processed the echo against the document state first.
 */
function releaseHolds(state: StoreContext<DocumentStoreState>['state'], publishedId: string): void {
  setCleanupTimeout(() => {
    // A transaction queued during the delay holds the documents again.
    if (state.get().engines[publishedId]?.hasPending()) return
    const ids = [getDraftId(DocumentId(publishedId)), publishedId]
    state.set('releaseEngineHolds', (prev) => releaseEngineHolds(prev, ids))
  }, DOCUMENT_STATE_CLEAR_DELAY)
}

/**
 * Published ids of the documents with subscribers, leaving out release versions, once the queue
 * has loaded both the draft and the published document. The engine cannot serve a document
 * before that (`queueHasLoaded`), and starting it later keeps it from reading a document the
 * queue could not read.
 */
function enginePublishedIds(documentStates: DocumentStoreState['documentStates']): string[] {
  const ids = Object.keys(documentStates).filter((id) => !isVersionId(DocumentId(id)))
  const publishedIds = new Set(
    ids.map((id) => (isDraftId(DocumentId(id)) ? getPublishedId(DocumentId(id)) : id)),
  )
  return [...publishedIds].filter(
    (id) =>
      documentStates[id]?.local !== undefined &&
      documentStates[getDraftId(DocumentId(id))]?.local !== undefined,
  )
}

/**
 * The engine's transport, with its first snapshot fetch answered from the documents the queue has
 * already loaded.
 */
function startingFromQueue(
  state: StoreContext<DocumentStoreState>['state'],
  transport: Transport,
): Transport {
  let firstFetch = true
  return {
    ...transport,
    fetch(ids) {
      // The queue's `remote` documents are built from the same listener and Mendoza effects. Only
      // the first fetch uses them: a later one is a refetch after a gap, which needs the server.
      const loaded = firstFetch ? ids.map((id) => state.get().documentStates[id]?.remote) : []
      firstFetch = false
      if (loaded.length && loaded.every((doc) => doc !== undefined)) {
        return Promise.resolve(loaded as (SanityDocument | null)[])
      }
      return transport.fetch(ids)
    },
  }
}

/** The queue's backoff for retried submissions, read on each retry. */
const submissionRetryDelay = (attempt: number) =>
  Math.min(SUBMISSION_RETRY_BASE_DELAY * 2 ** (attempt - 1), SUBMISSION_RETRY_MAX_DELAY)

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
  const logger = createLogger('document', {
    instanceContext: {
      instanceId: instance.instanceId,
      projectId: instance.config.projectId,
      dataset: instance.config.dataset,
    },
  })
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
        const sync = createDocumentSync({
          documentId: id,
          transport: startingFromQueue(state, transport),
          retryDelay: submissionRetryDelay,
          // As on the queue: edits go out together, at most once per interval.
          editBatchInterval: EDIT_BATCH_INTERVAL,
        })
        const unsubscribe = sync.subscribe(() => {
          state.set('engineChanged', (prev) => ({engineChanges: prev.engineChanges + 1}))
          if (!sync.hasPending()) releaseHolds(state, id)
        })
        const unsubscribeDropped = sync.onDropped((dropped) =>
          emitDropped(state.get(), dropped, id),
        )
        // A diagnostic: the edit landed, but the local view showed something else until its echo.
        const unsubscribeDivergence = sync.onDivergence(({transaction, documentId, paths}) =>
          logger.warn('Content Lake stored an edit differently from the local replay', {
            documentId,
            transactionId: transaction.transactionId,
            paths,
          }),
        )
        cleanups.set(id, () => {
          unsubscribe()
          unsubscribeDropped()
          unsubscribeDivergence()
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
  subscription.add(
    getConfirmedUserState(instance)
      .observable.pipe(
        map((user) => user?.id),
        filter((userId): userId is string => !!userId),
      )
      .subscribe((userId) => discardOtherUsersEdits(state.get(), userId)),
  )
  return subscription
}

/**
 * When a user is confirmed, as on the queue: binds unattributed engine transactions to them,
 * drops the ones another user made from their engines (reported as `reverted`), and wakes every
 * engine, so writes held for this user's token go out without waiting out the backoff.
 * @internal
 */
export function discardOtherUsersEdits(
  {engineTransactions, engines}: DocumentStoreState,
  userId: string,
): void {
  const byEngine = new Map<string, string[]>()
  for (const [transactionId, transaction] of engineTransactions) {
    transaction.author ??= userId
    if (transaction.author === userId) continue
    const publishedId = publishedIdOf(transaction)
    byEngine.set(publishedId, [...(byEngine.get(publishedId) ?? []), transactionId])
  }
  for (const [publishedId, transactionIds] of byEngine) {
    engines[publishedId]?.discardPending(transactionIds)
  }
  for (const engine of Object.values(engines)) engine?.retryNow()
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

/** An Actions API payload the queue would send, as the engine operation that sends it. */
function toOperation(action: HttpAction): Operation {
  switch (action.actionType) {
    case 'sanity.action.document.edit':
      return {type: 'edit', patches: [action.patch as PatchOps]}
    case 'sanity.action.document.version.create':
      return {type: 'create', attributes: action.attributes}
    case 'sanity.action.document.publish':
      return {type: 'publish'}
    case 'sanity.action.document.unpublish':
      return {type: 'unpublish'}
    case 'sanity.action.document.version.discard':
      return {type: 'discard'}
    case 'sanity.action.document.delete':
      return {type: 'delete'}
    default:
      throw new Error(`The engine does not send ${action.actionType}`)
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
 * Runs the actions through the transaction queue's `processActions` against the engine's local
 * view: the queue's state and grant checks, which throw its `ActionError` or
 * `PermissionActionError`, and the Actions API payloads it would send, with edits re-derived by
 * diffing as on the queue.
 */
function processAsQueue(
  {grants, identity}: DocumentStoreState & {grants: NonNullable<DocumentStoreState['grants']>},
  engine: DocumentSync,
  actions: Action[],
  transactionId: string,
) {
  const [leading] = actions as (EngineAction & {documentId: string})[]
  const documents = localDocumentSet(engine, leading!.documentId)
  return processActions({
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
 * the transaction queue. The actions go out as one engine transaction under the caller's
 * transaction id.
 */
export function applyWithEngine(
  state: DocumentStoreState,
  actions: Action[],
  transactionId: string,
  author?: string,
):
  | {
      engine: DocumentSync
      handle: DocumentHandle
      previous: ResolveDocument | null
      /** The ids of the engine transactions the actions went out as: none, or the caller's id. */
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
  const {grants} = state
  if (!engine || !grants) return undefined
  const previous = engine.local() as ResolveDocument | null
  const processed = processAsQueue({...state, grants}, engine, actions, transactionId)
  // An edit that changes nothing sends nothing, as on the transaction queue.
  const operations = processed.outgoingActions.map(toOperation)
  // Edits are batched only with edits by the same user.
  const transactionIds = operations.length
    ? [engine.apply(operations, {transactionId, ...(author && {batchKey: author})})]
    : []
  for (const id of transactionIds) {
    let settle!: EngineTransaction['settle']
    const settled = new Promise<{error?: unknown}>((resolve) => (settle = resolve))
    state.engineTransactions.set(id, {
      settled,
      settle,
      actions,
      callerTransactionId: transactionId,
      failedAttempts: 0,
      ...(author && {author}),
      previous: processed.previous,
      working: processed.working,
    })
  }
  return {engine, handle: leading, previous, transactionIds}
}
