import {type Action} from '@sanity/client'
import {getPublishedId} from '@sanity/client/csm'
import {type SanityDocument} from '@sanity/types'
import {type ExprNode} from 'groq-js'
import {
  catchError,
  concatMap,
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
  startWith,
  Subject,
  switchMap,
  tap,
  throttle,
  timer,
  withLatestFrom,
} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type DocumentHandle} from '../config/sanityConfig'
import {bindActionByDataset, type StoreAction} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {createStateSourceAction, type StateSource} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {getDraftId} from '../utils/ids'
import {type DocumentAction} from './actions'
import {API_VERSION, INITIAL_OUTGOING_THROTTLE_TIME} from './documentConstants'
import {type DocumentEvent, getDocumentEvents} from './events'
import {listen, OutOfSyncError} from './listen'
import {type JsonMatch, jsonMatch, type JsonMatchPath} from './patchOperations'
import {calculatePermissions, createGrantsLookup, type DatasetAcl, type Grant} from './permissions'
import {ActionError} from './processActions'
import {
  type AppliedTransaction,
  applyFirstQueuedTransaction,
  applyRemoteDocument,
  cleanupOutgoingTransaction,
  getDocumentIdsFromActions,
  manageSubscriberIds,
  type OutgoingTransaction,
  type QueuedTransaction,
  removeQueuedTransaction,
  revertOutgoingTransaction,
  transitionAppliedTransactionsToOutgoing,
  type UnverifiedDocumentRevision,
} from './reducers'
import {createFetchDocument, createSharedListener, type SharedListener} from './sharedListener'

export interface DocumentStoreState {
  documentStates: {[TDocumentId in string]?: DocumentState}
  queued: QueuedTransaction[]
  applied: AppliedTransaction[]
  outgoing?: OutgoingTransaction
  grants?: Record<Grant, ExprNode>
  error?: unknown
  sharedListener: SharedListener
  fetchDocument: (documentId: string) => Observable<SanityDocument | null>
  events: Subject<DocumentEvent>
}

export interface DocumentState {
  id: string
  /**
   * the "remote" local copy that matches the server. represents the last known
   * server state. this gets updated every time we confirm remote patches
   */
  remote?: SanityDocument | null
  /**
   * the current ephemeral working copy that includes local optimistic changes
   * that have not yet been confirmed by the server
   */
  local?: SanityDocument | null
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
}

export const documentStore = defineStore<DocumentStoreState>({
  name: 'Document',
  getInitialState: (instance) => ({
    documentStates: {},
    // these can be emptied on refetch
    queued: [],
    applied: [],
    sharedListener: createSharedListener(instance),
    fetchDocument: createFetchDocument(instance),
    events: new Subject(),
  }),
  initialize(context) {
    const {sharedListener} = context.state.get()
    const subscriptions = [
      subscribeToQueuedAndApplyNextTransaction(context),
      subscribeToSubscriptionsAndListenToDocuments(context),
      subscribeToAppliedAndSubmitNextTransaction(context),
      subscribeToClientAndFetchDatasetAcl(context),
    ]

    return () => {
      sharedListener.dispose()
      subscriptions.forEach((subscription) => subscription.unsubscribe())
    }
  },
})

/** @beta */
export function getDocumentState<
  TDocument extends SanityDocument,
  TPath extends JsonMatchPath<TDocument>,
>(
  instance: SanityInstance,
  doc: string | DocumentHandle<TDocument>,
  path: TPath,
): StateSource<JsonMatch<TDocument, TPath> | undefined>
/** @beta */
export function getDocumentState<TDocument extends SanityDocument>(
  instance: SanityInstance,
  doc: string | DocumentHandle<TDocument>,
): StateSource<TDocument | null>
/** @beta */
export function getDocumentState(
  instance: SanityInstance,
  doc: string | DocumentHandle,
  path?: string,
): StateSource<unknown>
/** @beta */
export function getDocumentState(
  ...args: Parameters<typeof _getDocumentState>
): StateSource<unknown> {
  return _getDocumentState(...args)
}
const _getDocumentState = bindActionByDataset(
  documentStore,
  createStateSourceAction({
    selector: ({state: {error, documentStates}}, doc: string | DocumentHandle, path?: string) => {
      const documentId = typeof doc === 'string' ? doc : doc.documentId
      if (error) throw error
      const draftId = getDraftId(documentId)
      const publishedId = getPublishedId(documentId)
      const draft = documentStates[draftId]?.local
      const published = documentStates[publishedId]?.local

      const document = draft ?? published
      if (document === undefined) return undefined
      if (path) return jsonMatch(document, path).at(0)?.value
      return document
    },
    onSubscribe: (context, doc: string | DocumentHandle) =>
      manageSubscriberIds(context, typeof doc === 'string' ? doc : doc.documentId),
  }),
)

/** @beta */
export function resolveDocument<TDocument extends SanityDocument>(
  instance: SanityInstance,
  doc: string | DocumentHandle<TDocument>,
): Promise<TDocument | null>
/** @beta */
export function resolveDocument(
  instance: SanityInstance,
  doc: string | DocumentHandle,
): Promise<SanityDocument | null>
/** @beta */
export function resolveDocument(
  ...args: Parameters<typeof _resolveDocument>
): Promise<SanityDocument | null> {
  return _resolveDocument(...args)
}
const _resolveDocument = bindActionByDataset(
  documentStore,
  ({instance}, doc: string | DocumentHandle) => {
    const documentId = typeof doc === 'string' ? doc : doc.documentId
    return firstValueFrom(
      getDocumentState(instance, documentId).observable.pipe(filter((i) => i !== undefined)),
    )
  },
)

/** @beta */
export const getDocumentSyncStatus = bindActionByDataset(
  documentStore,
  createStateSourceAction({
    selector: (
      {state: {error, documentStates: documents, outgoing, applied, queued}},
      doc: DocumentHandle,
    ) => {
      const documentId = typeof doc === 'string' ? doc : doc.documentId
      if (error) throw error
      const draftId = getDraftId(documentId)
      const publishedId = getPublishedId(documentId)

      const draft = documents[draftId]
      const published = documents[publishedId]

      if (draft === undefined || published === undefined) return undefined
      return !queued.length && !applied.length && !outgoing
    },
    onSubscribe: (context, doc: DocumentHandle) => manageSubscriberIds(context, doc.documentId),
  }),
)

/** @beta */
export const getPermissionsState = bindActionByDataset(
  documentStore,
  createStateSourceAction({
    selector: calculatePermissions,
    onSubscribe: (context, actions) =>
      manageSubscriberIds(context, getDocumentIdsFromActions(actions)),
  }) as StoreAction<
    DocumentStoreState,
    [DocumentAction | DocumentAction[]],
    StateSource<ReturnType<typeof calculatePermissions>>
  >,
)

/** @beta */
export const resolvePermissions = bindActionByDataset(
  documentStore,
  ({instance}, actions: DocumentAction | DocumentAction[]) => {
    return firstValueFrom(
      getPermissionsState(instance, actions).observable.pipe(filter((i) => i !== undefined)),
    )
  },
)

/** @beta */
export const subscribeDocumentEvents = bindActionByDataset(
  documentStore,
  ({state}, eventHandler: (e: DocumentEvent) => void) => {
    const {events} = state.get()
    const subscription = events.subscribe(eventHandler)
    return () => subscription.unsubscribe()
  },
)

const subscribeToQueuedAndApplyNextTransaction = ({state}: StoreContext<DocumentStoreState>) => {
  const {events} = state.get()
  return state.observable
    .pipe(
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
}: StoreContext<DocumentStoreState>) => {
  const {events} = state.get()

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
      withLatestFrom(getClientState(instance, {apiVersion: API_VERSION}).observable),
      concatMap(([outgoing, client]) => {
        if (!outgoing) return EMPTY
        return client.observable
          .action(outgoing.outgoingActions as Action[], {
            transactionId: outgoing.transactionId,
            skipCrossDatasetReferenceValidation: true,
          })
          .pipe(
            catchError((error) => {
              state.set('revertOutgoingTransaction', revertOutgoingTransaction)
              events.next({type: 'reverted', message: error.message, outgoing, error})
              return EMPTY
            }),
            map((result) => ({result, outgoing})),
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
  context: StoreContext<DocumentStoreState>,
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
          const aIsDraft = a.id === getDraftId(a.id)
          const bIsDraft = b.id === getDraftId(b.id)

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
              catchError((error) => {
                // retry on `OutOfSyncError`
                if (error instanceof OutOfSyncError) listen(context, e.id)
                throw error
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
}: StoreContext<DocumentStoreState>) => {
  const {projectId, dataset} = instance.config
  return getClientState(instance, {apiVersion: API_VERSION})
    .observable.pipe(
      switchMap((client) =>
        client.observable.request<DatasetAcl>({
          uri: `/projects/${projectId}/datasets/${dataset}/acl`,
          tag: 'acl.get',
          withCredentials: true,
        }),
      ),
      tap((datasetAcl) => state.set('setGrants', {grants: createGrantsLookup(datasetAcl)})),
    )
    .subscribe({
      error: (error) => state.set('setError', {error}),
    })
}
