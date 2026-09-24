import {
  type Action,
  ClientError,
  CorsOriginError,
  type Mutation,
  type SanityClient,
  ServerError,
} from '@sanity/client'
import {DocumentId, getDraftId, getPublishedId, getVersionId} from '@sanity/id-utils'
import {jsonMatch} from '@sanity/json-match'
import {type ExprNode} from 'groq-js'
import {
  catchError,
  concatMap,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  first,
  firstValueFrom,
  groupBy,
  map,
  mergeMap,
  Observable,
  of,
  pairwise,
  race,
  retry,
  startWith,
  Subject,
  switchMap,
  tap,
  throttle,
  throwError,
  timer,
  withLatestFrom,
} from 'rxjs'

import {getCurrentUserState} from '../auth/authStore'
import {type ClientOptions, getClientState} from '../client/clientStore'
import {
  type DocumentHandle,
  type DocumentResource,
  isCanvasResource,
  isDatasetResource,
  isMediaLibraryResource,
} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {
  bindActionByResource,
  type BoundResourceKey,
  type StoreAction,
} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {createStateSourceAction, type StateSource} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {type DocumentValue, type ResolveDocument} from '../typegen/resolve'
import {omitProperty} from '../utils/object'
import {type DocumentAction} from './actions'
import {
  ACL_RETRY_BASE_DELAY,
  ACL_RETRY_MAX_DELAY,
  API_VERSION,
  INITIAL_OUTGOING_THROTTLE_TIME,
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_COUNT,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
  SUBMISSION_RETRY_BASE_DELAY,
  SUBMISSION_RETRY_MAX_DELAY,
} from './documentConstants'
import {isUnknownDocumentId, type UnknownDocumentId} from './documentKey'
import {
  type DocumentEvent,
  type DocumentTransactionSubmissionResult,
  getDocumentEvents,
} from './events'
import {listen, OutOfSyncError} from './listen'
import {type JsonMatch} from './patchOperations'
import {
  calculatePermissions,
  createGrantsLookup,
  type DatasetAcl,
  type DocumentPermissionsResult,
  type Grant,
} from './permissions'
import {ActionError} from './processActions/processActions'
import {isReleaseAction} from './processActions/releaseUtil'
import {
  type AppliedTransaction,
  applyFirstQueuedTransaction,
  applyRemoteDocument,
  cleanupOutgoingTransaction,
  getDocumentIdsFromHandleLikes,
  manageSubscriberIds,
  type OutgoingTransaction,
  type QueuedTransaction,
  removeQueuedTransaction,
  revertOutgoingTransaction,
  transitionAppliedTransactionsToOutgoing,
  type UnverifiedDocumentRevision,
} from './reducers'
import {
  createFetchDocument,
  createFetchDocumentGroup,
  createSharedListener,
  type DocumentGroupResponse,
  type SharedListener,
} from './sharedListener'
import {classifySubmissionError} from './submissionErrors'
import {
  getVariantCandidateKeys,
  resolveVariantKey,
  subscribeToVariantSubscriptionsAndDiscover,
} from './variantTracking'

export interface DocumentStoreState {
  documentStates: {[TDocumentId in string]?: DocumentState}
  /**
   * Maps a variant's document key (see `getDocumentKey`) to the store key
   * currently holding it. Variant ids are opaque hashes, so this index is the
   * only way to go from a handle to a variant's `documentStates` entry.
   *
   * - absent: not yet resolved; the group has not been fetched
   * - `null`: the remote confirmed no such variant exists
   * - a concrete id: the variant's `_id`
   * - an `UnknownDocumentId` (equal to the key): created locally, pending
   */
  variantIndex: {[VariantKey in string]?: DocumentId | UnknownDocumentId | null}
  /**
   * Subscription ids interested in each variant key. Kept separately from
   * `documentStates` because until the key resolves there is no document
   * state to attach them to.
   */
  variantSubscriptions: {[VariantKey in string]?: string[]}
  queued: QueuedTransaction[]
  applied: AppliedTransaction[]
  outgoing?: OutgoingTransaction
  grants?: Record<Grant, ExprNode>
  /**
   * The current user's identity (their user ID).
   */
  identity?: string
  error?: unknown
  sharedListener: SharedListener
  fetchDocument: (documentId: string) => Observable<ResolveDocument | null>
  fetchDocumentGroup: (groupId: string) => Observable<DocumentGroupResponse>
  events: Subject<DocumentEvent>
}

export interface DocumentState {
  id: string
  error?: unknown
  /**
   * the "remote" local copy that matches the server. represents the last known
   * server state. this gets updated every time we confirm remote patches
   */
  remote?: ResolveDocument | null
  /**
   * the current ephemeral working copy that includes local optimistic changes
   * that have not yet been confirmed by the server
   */
  local?: ResolveDocument | null
  /**
   * the revision that our remote document is at
   */
  remoteRev?: string | null
  /**
   * Array of subscription IDs. This document state will be deleted if there are
   * no subscribers.
   */
  subscriptions: string[]
  /**
   * An object keyed by transaction ID of revisions sent out but that have not
   * yet been verified yet. When an applied transaction is transitioned to an
   * outgoing transaction, it also adds unverified revisions for each document
   * that is part of that outgoing transaction. Transactions are submitted to
   * the server with a locally generated transaction ID. This way we can observe
   * when our transaction comes back through the shared listener. Each listener
   * event that comes back contains a `previousRev`. If we see our own
   * transaction with a different `previousRev` than expected, we can rebase our
   * local transactions on top of this new remote.
   */
  unverifiedRevisions?: {[TTransactionId in string]?: UnverifiedDocumentRevision}
  /**
   * transaction IDs recently submitted by this client for this document,
   * newest last. used to label `remote-patches` events with the correct
   * `origin` even after the corresponding `unverifiedRevisions` entry has
   * been pruned (e.g. by a sync event that raced the listener echo). capped
   * to the most recent entries.
   */
  recentOwnTransactionIds?: string[]
}

export const documentStore = defineStore<DocumentStoreState, BoundResourceKey>({
  name: 'Document',
  getInitialState: (instance, {resource}) => ({
    documentStates: {},
    variantIndex: {},
    variantSubscriptions: {},
    // these can be emptied on refetch
    queued: [],
    applied: [],
    sharedListener: createSharedListener(instance, resource),
    fetchDocument: createFetchDocument(instance, resource),
    fetchDocumentGroup: createFetchDocumentGroup(instance, resource),
    events: new Subject(),
  }),
  initialize(context) {
    const {sharedListener} = context.state.get()
    const subscriptions = [
      subscribeToQueuedAndApplyNextTransaction(context),
      subscribeToSubscriptionsAndListenToDocuments(context),
      subscribeToVariantSubscriptionsAndDiscover(context),
      subscribeToAppliedAndSubmitNextTransaction(context),
      subscribeToClientAndFetchDatasetAcl(context),
      subscribeToCurrentUserAndSetIdentity(context),
    ]

    return () => {
      sharedListener.dispose()
      subscriptions.forEach((subscription) => subscription.unsubscribe())
    }
  },
})

/**
 * @beta
 * Options for specifying a document and optionally a path within it.
 */
export interface DocumentOptions<
  TPath extends string | undefined = undefined,
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  path?: TPath
}

/** @beta */
export function getDocumentState<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  options: DocumentOptions<undefined, TDocumentType, TDataset, TProjectId>,
): StateSource<
  DocumentValue<ResolveDocument<TDocumentType, `${TProjectId}.${TDataset}`>> | undefined | null
>

/** @beta */
export function getDocumentState<
  TPath extends string = string,
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  options: DocumentOptions<TPath, TDocumentType, TDataset, TProjectId>,
): StateSource<
  JsonMatch<ResolveDocument<TDocumentType, `${TProjectId}.${TDataset}`>, TPath> | undefined
>

/** @beta */
export function getDocumentState<TData>(
  instance: SanityInstance,
  options: DocumentOptions<string | undefined>,
): StateSource<TData | undefined | null>

/** @beta */
export function getDocumentState(
  ...args: Parameters<typeof _getDocumentState>
): StateSource<unknown> {
  return _getDocumentState(...args)
}

const _getDocumentState = bindActionByResource(
  documentStore,
  createStateSourceAction({
    selector: ({state}, options: DocumentOptions<string | undefined>) => {
      const {path} = options
      if (state.error) throw state.error

      const document = resolveDocumentFromCandidates(state, options)
      if (document === undefined) return undefined

      if (!path) return document
      const result = jsonMatch(document, path).next()
      if (result.done) return undefined
      const {value} = result.value
      return value
    },
    onSubscribe: (context, options: DocumentOptions<string | undefined>) =>
      manageSubscriberIds(context, [options]),
  }),
)

type CandidateState = Pick<DocumentStoreState, 'documentStates' | 'variantIndex'>

const isStoreKey = (
  key: DocumentId | UnknownDocumentId | null | undefined,
): key is DocumentId | UnknownDocumentId => typeof key === 'string'

/** Rethrows the first per-document read error among the given store keys. */
function throwDocumentError(
  documentStates: DocumentStoreState['documentStates'],
  documentIds: string[],
): void {
  for (const documentId of documentIds) {
    const documentError = documentStates[documentId]?.error
    if (documentError) throw documentError
  }
}

/**
 * The store keys a handle's document may resolve through, most specific first,
 * following Content Lake's precedence: variant beats bundle, bundle beats
 * published.
 *
 *   drafts / default, variant v:  v-over-drafts → v-over-published → drafts.g → g
 *   release r, variant v:         v-over-r → v-over-published → versions.r.g → g
 *   no variant:                   versions.r.g → drafts.g → g
 *   liveEdit:                     g
 *
 * A variant candidate is `undefined` until its key is resolved and `null` when
 * the remote confirmed it doesn't exist.
 */
function getDocumentCandidateKeys(
  state: CandidateState,
  handle: DocumentHandle,
): (DocumentId | UnknownDocumentId | null | undefined)[] {
  const documentId = DocumentId(handle.documentId)
  if (handle.liveEdit) return [documentId]

  const variantKeys = getVariantCandidateKeys(handle).map((key) => resolveVariantKey(state, key))
  const versionId = isReleasePerspective(handle.perspective)
    ? getVersionId(documentId, handle.perspective.releaseName)
    : undefined
  return [
    ...variantKeys,
    ...(versionId ? [versionId] : []),
    getDraftId(documentId),
    getPublishedId(documentId),
  ]
}

/**
 * The `local` document behind each candidate key. `undefined` means that
 * candidate is still loading; `null` means it is known not to exist.
 */
function getDocumentCandidates(
  state: CandidateState,
  handle: DocumentHandle,
): (ResolveDocument | null | undefined)[] {
  return getDocumentCandidateKeys(state, handle).map((key) => {
    if (key === null) return null
    if (key === undefined) return undefined
    return state.documentStates[key]?.local
  })
}

/**
 * Resolves the document a handle currently displays: the first candidate that
 * exists. Returns `undefined` while any candidate ahead of the winner is still
 * loading, and `null` when none exist.
 *
 * A release version that hasn't loaded blocks resolution outright, matching
 * the previous behaviour; drafts and published must both be loaded before
 * either is shown so the published document never flashes before the draft.
 */
function resolveDocumentFromCandidates(
  state: CandidateState,
  handle: DocumentHandle,
): DocumentValue<ResolveDocument> | null | undefined {
  const keys = getDocumentCandidateKeys(state, handle)
  throwDocumentError(state.documentStates, keys.filter(isStoreKey))
  const candidates = getDocumentCandidates(state, handle)
  const tail = candidates.slice(-2)
  if (!handle.liveEdit && tail.some((candidate) => candidate === undefined)) return undefined

  for (const [index, candidate] of candidates.entries()) {
    if (candidate === undefined) return undefined
    if (candidate === null) continue
    // a document held under a pending key has no concrete id yet; it must not
    // leak the key in its place
    return isUnknownDocumentId(keys[index] ?? '') ? withoutId(candidate) : candidate
  }
  return null
}

/**
 * Memoised per source document: selectors feed `useSyncExternalStore`, which
 * requires a stable snapshot reference between store changes. Recomputing the
 * stripped view on every call would make React see a new snapshot each render
 * and re-render forever.
 */
const withoutIdCache = new WeakMap<ResolveDocument, DocumentValue<ResolveDocument>>()

function withoutId(document: ResolveDocument): DocumentValue<ResolveDocument> {
  let stripped = withoutIdCache.get(document)

  if (!stripped) {
    // `ResolveDocument` is a union of every schema type, and `Omit` over a
    // union keeps only the keys they share, so TypeScript can't relate
    // `omitProperty`'s result to the distributive `DocumentValue`. The shapes
    // are the same, but `_id` is removed.
    stripped = omitProperty(document, '_id') as DocumentValue<ResolveDocument>
    withoutIdCache.set(document, stripped)
  }

  return stripped
}

/** @beta */
export function resolveDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  docHandle: DocumentHandle<TDocumentType, TDataset, TProjectId>,
): Promise<DocumentValue<ResolveDocument<TDocumentType, `${TProjectId}.${TDataset}`>> | null>
/** @beta */
export function resolveDocument<TData extends ResolveDocument>(
  instance: SanityInstance,
  docHandle: DocumentHandle<string, string, string>,
): Promise<TData | null>
/** @beta */
export function resolveDocument(
  ...args: Parameters<typeof _resolveDocument>
): Promise<ResolveDocument | null> {
  return _resolveDocument(...args)
}
const _resolveDocument = bindActionByResource(
  documentStore,
  ({instance}, docHandle: DocumentHandle<string, string, string>) => {
    return firstValueFrom(
      getDocumentState(instance, {
        ...docHandle,
        path: undefined,
      }).observable.pipe(filter((i) => i !== undefined)),
    ) as Promise<ResolveDocument | null>
  },
)

/** @beta */
export const getDocumentSyncStatus = bindActionByResource(
  documentStore,
  createStateSourceAction({
    selector: ({state}, doc: DocumentHandle) => {
      const {error, outgoing, applied, queued} = state
      if (error) throw error

      // every candidate the handle may resolve through must at least have a
      // state entry (and every variant key be resolved) before sync status is
      // meaningful
      const keys = getDocumentCandidateKeys(state, doc)
      throwDocumentError(state.documentStates, keys.filter(isStoreKey))
      const tracked = keys.every((key) =>
        key === null ? true : key !== undefined && state.documentStates[key] !== undefined,
      )
      if (!tracked) return undefined
      return !queued.length && !applied.length && !outgoing
    },
    onSubscribe: (context, doc: DocumentHandle) => {
      return manageSubscriberIds(context, [doc])
    },
  }),
)

type PermissionsStateOptions = {
  resource?: DocumentResource
  actions: DocumentAction[]
}

/** @beta */
export const getPermissionsState = bindActionByResource(
  documentStore,
  createStateSourceAction({
    selector: calculatePermissions,
    onSubscribe: (context, {actions}: PermissionsStateOptions) => {
      manageSubscriberIds(context, actions)
    },
  }) as StoreAction<
    DocumentStoreState,
    [PermissionsStateOptions],
    StateSource<DocumentPermissionsResult>
  >,
)

/** @beta */
export const resolvePermissions = bindActionByResource(
  documentStore,
  ({instance}, options: PermissionsStateOptions) => {
    return firstValueFrom(
      getPermissionsState(instance, options).observable.pipe(filter((i) => i !== undefined)),
    )
  },
)

/** @beta */
export const subscribeDocumentEvents = bindActionByResource(
  documentStore,
  ({state}, options: {resource?: DocumentResource; eventHandler: (e: DocumentEvent) => void}) => {
    const {events} = state.get()
    const subscription = events.subscribe(options.eventHandler)
    return () => subscription.unsubscribe()
  },
)

function failTransactionOnUnreadableDocument({queued, documentStates}: DocumentStoreState): void {
  const transaction = queued.at(0)
  if (!transaction) return
  const ids = getDocumentIdsFromHandleLikes(transaction.actions)
  const unreadableId = ids.find((id) => documentStates[id]?.error)
  if (unreadableId === undefined) return
  const error = documentStates[unreadableId]?.error
  const actionError = new ActionError({
    message: error instanceof Error ? error.message : String(error),
    documentId: unreadableId,
    transactionId: transaction.transactionId,
  })
  actionError.cause = error
  throw actionError
}

const subscribeToQueuedAndApplyNextTransaction = ({
  state,
}: StoreContext<DocumentStoreState, BoundResourceKey>) => {
  const {events} = state.get()
  return state.observable
    .pipe(
      tap(failTransactionOnUnreadableDocument),
      map(applyFirstQueuedTransaction),
      distinctUntilChanged(),
      tap((next) => state.set('applyFirstQueuedTransaction', next)),
      catchError((error, caught) => {
        if (error instanceof ActionError) {
          state.set('removeQueuedTransaction', (prev) =>
            removeQueuedTransaction(prev, error.transactionId),
          )
          events.next({
            type: 'error',
            message: error.message,
            documentId: error.documentId,
            transactionId: error.transactionId,
            error,
          })
          return caught
        }

        throw error
      }),
    )
    .subscribe({error: (error) => state.set('setError', {error})})
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Request failed'

const submitOutgoingTransaction = (client: SanityClient, outgoing: OutgoingTransaction) => {
  // liveEdit transactions route to the mutations API; everything else routes
  // to the actions API. processActions rejects transactions that mix the two,
  // and reducers won't batch across that boundary, so a batch is always
  // entirely liveEdit or entirely not.
  if (outgoing.actions.some((action) => !isReleaseAction(action) && action.liveEdit)) {
    return client.observable.mutate(outgoing.outgoingMutations as Mutation[], {
      transactionId: outgoing.transactionId,
      visibility: 'async',
      returnDocuments: false,
      returnFirst: false,
      tag: 'document.mutate',
      skipCrossDatasetReferenceValidation: true,
    })
  }

  return client.observable.action(outgoing.outgoingActions as Action[], {
    transactionId: outgoing.transactionId,
    skipCrossDatasetReferenceValidation: true,
    tag: 'document.action',
  })
}

const subscribeToAppliedAndSubmitNextTransaction = ({
  state,
  instance,
  key: {resource},
}: StoreContext<DocumentStoreState, BoundResourceKey>) => {
  const {events} = state.get()
  const clients$ = getClientState(instance, {apiVersion: API_VERSION, resource}).observable

  return state.observable
    .pipe(
      throttle(
        (s) =>
          // if there is no outgoing transaction, we can throttle by the
          // initial outgoing throttle time…
          !s.outgoing
            ? timer(INITIAL_OUTGOING_THROTTLE_TIME)
            : // …otherwise, wait until the outgoing has been cleared
              state.observable.pipe(first(({outgoing}) => !outgoing)),
        {leading: false, trailing: true},
      ),
      map(transitionAppliedTransactionsToOutgoing),
      distinctUntilChanged((a, b) => a.outgoing?.transactionId === b.outgoing?.transactionId),
      tap((next) => state.set('transitionAppliedTransactionsToOutgoing', next)),
      map((s) => s.outgoing),
      distinctUntilChanged(),
      withLatestFrom(clients$),
      concatMap(([outgoing, initialClient]) => {
        if (!outgoing) return EMPTY

        // the client that made the latest attempt. the client store rebuilds
        // its clients when the token changes, so a different client means
        // different credentials and a retry after a 401 can go right away
        let attemptClient: SanityClient | undefined

        return defer(() => (attemptClient ? clients$.pipe(first()) : of(initialClient))).pipe(
          concatMap((client) => {
            attemptClient = client
            return submitOutgoingTransaction(client, outgoing)
          }),
          retry({
            delay: (error: unknown, retryCount) => {
              if (classifySubmissionError(error) !== 'retry') return throwError(() => error)

              // keep the transaction and its optimistic local state. the
              // document stays out of sync (see `getDocumentSyncStatus`) and
              // later edits queue behind this transaction until it lands
              events.next({
                type: 'submission-failed',
                message: getErrorMessage(error),
                error,
                outgoing,
                attempt: retryCount,
              })
              const backoff = Math.min(
                SUBMISSION_RETRY_BASE_DELAY * 2 ** (retryCount - 1),
                SUBMISSION_RETRY_MAX_DELAY,
              )
              return race(
                timer(backoff),
                clients$.pipe(first((client) => client !== attemptClient)),
              )
            },
          }),
          catchError((error: unknown) => {
            if (classifySubmissionError(error) === 'accepted') {
              // an earlier attempt was committed and only its response was
              // lost, so this is an ack
              return of({transactionId: outgoing.transactionId, documentIds: [], results: []})
            }
            state.set('revertOutgoingTransaction', revertOutgoingTransaction)
            events.next({type: 'reverted', message: getErrorMessage(error), outgoing, error})
            return EMPTY
          }),
          map((result: unknown) => ({
            result: result as DocumentTransactionSubmissionResult,
            outgoing,
          })),
        )
      }),
      tap(({outgoing, result}) => {
        state.set('cleanupOutgoingTransaction', cleanupOutgoingTransaction)
        for (const e of getDocumentEvents(outgoing)) events.next(e)
        events.next({type: 'accepted', outgoing, result})
      }),
    )
    .subscribe({error: (error) => state.set('setError', {error})})
}

const subscribeToSubscriptionsAndListenToDocuments = (
  context: StoreContext<DocumentStoreState, BoundResourceKey>,
) => {
  const {state} = context
  const {events} = state.get()

  return state.observable
    .pipe(
      filter((s) => !!s.grants),
      // a pending variant's entry is keyed by an unknown id that the remote
      // can't be asked about; it is populated through the variant index instead
      map((s) => Object.keys(s.documentStates).filter((id) => !isUnknownDocumentId(id))),
      distinctUntilChanged((curr, next) => {
        if (curr.length !== next.length) return false
        const currSet = new Set(curr)
        return next.every((i) => currSet.has(i))
      }),
      startWith(new Set<string>()),
      pairwise(),
      switchMap((pair) => {
        const [curr, next] = pair.map((ids) => new Set(ids))
        const added = Array.from(next).filter((i) => !curr.has(i))
        const removed = Array.from(curr).filter((i) => !next.has(i))

        // NOTE: the order of which these go out is somewhat important
        // because that determines the order `applyRemoteDocument` is called
        // which in turn determines which document version get populated
        // first. because we prefer drafts, it's better to have those go out
        // first so that the published document doesn't flash for a frame
        const changes = [
          ...added.map((id) => ({id, add: true})),
          ...removed.map((id) => ({id, add: false})),
        ].sort((a, b) => {
          const aIsDraft = a.id === getDraftId(DocumentId(a.id))
          const bIsDraft = b.id === getDraftId(DocumentId(b.id))

          if (aIsDraft && bIsDraft) return a.id.localeCompare(b.id, 'en-US')
          if (aIsDraft) return -1
          if (bIsDraft) return 1
          return a.id.localeCompare(b.id, 'en-US')
        })

        return of<{id: string; add: boolean}[]>(...changes)
      }),
      groupBy((i) => i.id),
      mergeMap((group) =>
        group.pipe(
          switchMap((e) => {
            if (!e.add) return EMPTY
            return listen(context, e.id).pipe(
              retry({
                count: OUT_OF_SYNC_RETRY_COUNT,
                resetOnSuccess: true,
                delay: (error, retryCount) => {
                  const isTransient =
                    error instanceof OutOfSyncError ||
                    error instanceof ServerError ||
                    (error instanceof ClientError &&
                      (error.statusCode === 408 || error.statusCode === 429))
                  if (!isTransient) return throwError(() => error)
                  const backoff = Math.min(
                    OUT_OF_SYNC_RETRY_BASE_DELAY * 2 ** (retryCount - 1),
                    OUT_OF_SYNC_RETRY_MAX_DELAY,
                  )
                  return timer(backoff)
                },
              }),
              catchError((error) => {
                state.set('setDocumentError', (prev) => {
                  const documentState = prev.documentStates[e.id]
                  if (!documentState) return prev
                  return {
                    ...prev,
                    documentStates: {...prev.documentStates, [e.id]: {...documentState, error}},
                  }
                })
                return EMPTY
              }),
              tap((remote) =>
                state.set('applyRemoteDocument', (prev) =>
                  applyRemoteDocument(prev, remote, events),
                ),
              ),
            )
          }),
        ),
      ),
    )
    .subscribe({error: (error) => state.set('setError', {error})})
}

const subscribeToClientAndFetchDatasetAcl = ({
  instance,
  state,
  key: {resource},
}: StoreContext<DocumentStoreState, BoundResourceKey>) => {
  const clientOptions: ClientOptions = {apiVersion: API_VERSION, resource}

  let url: string
  if (resource && isDatasetResource(resource)) {
    url = `/projects/${resource.projectId}/datasets/${resource.dataset}/acl`
  } else if (resource && isMediaLibraryResource(resource)) {
    url = `/media-libraries/${resource.mediaLibraryId}/acl`
  } else if (resource && isCanvasResource(resource)) {
    url = `/canvases/${resource.canvasId}/acl`
  } else {
    throw new Error(`Received invalid resource: ${JSON.stringify(resource)}`)
  }

  return getClientState(instance, clientOptions)
    .observable.pipe(
      switchMap((client) =>
        client.observable
          .request<DatasetAcl>({
            url,
            tag: 'acl.get',
          })
          .pipe(
            retry({
              delay: (error, retryCount) => {
                // 4xx responses and CORS misconfigurations are not transient —
                // the server will keep rejecting the request, so rethrow to
                // surface them as a fatal store error. 408 (request timeout)
                // and 429 (rate limit) are the exceptions: they resolve on
                // their own, so they are retried like network errors
                const isTransientClientError =
                  error instanceof ClientError &&
                  (error.statusCode === 408 || error.statusCode === 429)
                if (
                  (error instanceof ClientError && !isTransientClientError) ||
                  error instanceof CorsOriginError
                ) {
                  return throwError(() => error)
                }
                // network errors (no status code), 408/429 responses, and 5xx
                // responses are retried with exponential backoff so a transient
                // failure during startup doesn't permanently brick the store
                const backoff = Math.min(
                  ACL_RETRY_BASE_DELAY * 2 ** (retryCount - 1),
                  ACL_RETRY_MAX_DELAY,
                )
                return timer(backoff)
              },
            }),
          ),
      ),
      tap((datasetAcl) => state.set('setGrants', {grants: createGrantsLookup(datasetAcl)})),
    )
    .subscribe({
      error: (error) => state.set('setError', {error}),
    })
}

const subscribeToCurrentUserAndSetIdentity = ({
  instance,
  state,
}: StoreContext<DocumentStoreState, BoundResourceKey>) =>
  getCurrentUserState(instance).observable.subscribe({
    next: (currentUser) => state.set('setIdentity', {identity: currentUser?.id}),
    // A transient identity-fetch failure (network blip, expired token, or a
    // normal logout/re-login transition) should not brick all document
    // operations. Reset the identity to `undefined` and keep going — GROQ's
    // `identity()` then evaluates to null, matching the unauthenticated state.
    error: () => state.set('setIdentity', {identity: undefined}),
  })
