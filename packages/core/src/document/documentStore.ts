import {type Action, ClientError, CorsOriginError, type Mutation, ServerError} from '@sanity/client'
import {DocumentId, getDraftId} from '@sanity/id-utils'
import {jsonMatch} from '@sanity/json-match'
import {type ExprNode} from 'groq-js'
import {
  catchError,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  filter,
  firstValueFrom,
  groupBy,
  map,
  mergeMap,
  Observable,
  of,
  pairwise,
  retry,
  startWith,
  Subject,
  switchMap,
  take,
  tap,
  throwError,
  timer,
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
import {requestQueryRefresh} from '../query/queryRefresh'
import {
  bindActionByResource,
  type BoundResourceKey,
  type StoreAction,
} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {createStateSourceAction, type StateSource} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {type ResolveDocument} from '../typegen/resolve'
import {type DocumentAction} from './actions'
import {
  ACL_RETRY_BASE_DELAY,
  ACL_RETRY_MAX_DELAY,
  API_VERSION,
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_COUNT,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
} from './documentConstants'
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
  type UnverifiedDocumentRevision,
} from './reducers'
import {scheduleOutgoingTransactions} from './scheduleOutgoingTransactions'
import {createFetchDocument, createSharedListener, type SharedListener} from './sharedListener'

export interface DocumentStoreState {
  documentStates: {[TDocumentId in string]?: DocumentState}
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
    // these can be emptied on refetch
    queued: [],
    applied: [],
    sharedListener: createSharedListener(instance, resource),
    fetchDocument: createFetchDocument(instance, resource),
    events: new Subject(),
  }),
  initialize(context) {
    const {sharedListener} = context.state.get()
    const subscriptions = [
      subscribeToQueuedAndApplyNextTransaction(context),
      subscribeToSubscriptionsAndListenToDocuments(context),
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
): StateSource<ResolveDocument<TDocumentType, `${TProjectId}.${TDataset}`> | undefined | null>

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

function throwDocumentError(
  documentStates: DocumentStoreState['documentStates'],
  documentIds: string[],
): void {
  for (const documentId of documentIds) {
    const documentError = documentStates[documentId]?.error
    if (documentError) throw documentError
  }
}

/** Version wins over draft, and draft over published. Undefined until every read has arrived. */
function selectLocalDocument(
  documentStates: DocumentStoreState['documentStates'],
  documentIds: string[],
): ResolveDocument | null | undefined {
  throwDocumentError(documentStates, documentIds)
  let selected: ResolveDocument | null = null
  for (const documentId of documentIds) {
    const local = documentStates[documentId]?.local
    if (local === undefined) return undefined
    if (selected === null) selected = local
  }
  return selected
}

function hasEveryDocumentArrived(
  documentStates: DocumentStoreState['documentStates'],
  documentIds: string[],
): boolean {
  throwDocumentError(documentStates, documentIds)
  return documentIds.every((documentId) => documentStates[documentId] !== undefined)
}

const _getDocumentState = bindActionByResource(
  documentStore,
  createStateSourceAction({
    selector: ({state: {error, documentStates}}, options: DocumentOptions<string | undefined>) => {
      const {path} = options
      if (error) throw error
      const document = selectLocalDocument(documentStates, getDocumentIdsFromHandleLikes([options]))
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

/** @beta */
export function resolveDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  docHandle: DocumentHandle<TDocumentType, TDataset, TProjectId>,
): Promise<ResolveDocument<TDocumentType, `${TProjectId}.${TDataset}`> | null>
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
    selector: (
      {state: {error, documentStates: documents, outgoing, applied, queued}},
      doc: DocumentHandle,
    ) => {
      if (error) throw error
      if (!hasEveryDocumentArrived(documents, getDocumentIdsFromHandleLikes([doc])))
        return undefined
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

const subscribeToAppliedAndSubmitNextTransaction = ({
  state,
  instance,
  key,
}: StoreContext<DocumentStoreState, BoundResourceKey>) => {
  const {events} = state.get()
  const {resource} = key
  const client$ = getClientState(instance, {apiVersion: API_VERSION, resource}).observable

  return scheduleOutgoingTransactions(state)
    .pipe(
      // The scheduler has already moved this transaction to `outgoing`. Wait for a client
      // instead of dropping the transaction, which would leave the queue blocked for good.
      concatMap((outgoing) =>
        client$.pipe(
          take(1),
          map((client) => [outgoing, client] as const),
        ),
      ),
      concatMap(([outgoing, client]) => {
        const revertOnError = catchError((error: unknown) => {
          state.set('revertOutgoingTransaction', revertOutgoingTransaction)
          const message = error instanceof Error ? error.message : 'Request failed'
          events.next({type: 'reverted', message, outgoing, error})
          return EMPTY
        })

        const toResult = map((result: unknown) => ({
          result: result as DocumentTransactionSubmissionResult,
          outgoing,
        }))

        // liveEdit transactions route to the mutations API; everything else routes
        // to the actions API. processActions rejects transactions that mix the two,
        // and reducers won't batch across that boundary, so a batch is always
        // entirely liveEdit or entirely not.
        if (outgoing.actions.some((action) => !isReleaseAction(action) && action.liveEdit)) {
          return client.observable
            .mutate(outgoing.outgoingMutations as Mutation[], {
              transactionId: outgoing.transactionId,
              visibility: 'async',
              returnDocuments: false,
              returnFirst: false,
              tag: 'document.mutate',
              skipCrossDatasetReferenceValidation: true,
            })
            .pipe(revertOnError, toResult)
        }

        return client.observable
          .action(outgoing.outgoingActions as Action[], {
            transactionId: outgoing.transactionId,
            skipCrossDatasetReferenceValidation: true,
            tag: 'document.action',
          })
          .pipe(
            revertOnError,
            // The Actions API responds once the change is visible to queries, so refetch
            // now instead of on the Live Content API event about a second later. Plain
            // edits are skipped: a typing user produces one about every second, and each
            // refresh refetches every active query. That includes the first edit of a
            // published document, so its new draft reaches query results through the
            // Live Content API as before. The mutations above use `async` visibility, so
            // their response does not mean the change is queryable yet.
            tap(() => {
              if (outgoing.actions.some((action) => action.type !== 'document.edit')) {
                requestQueryRefresh(key.name)
              }
            }),
            toResult,
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
      map((s) => Object.keys(s.documentStates)),
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
