import {type Action, type ListenEvent, SanityClient} from '@sanity/client'
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

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {API_VERSION} from '../documentList/documentListConstants'
import {type SanityInstance} from '../instance/types'
import {type ActionContext, createAction, createInternalAction} from '../resources/createAction'
import {createResource} from '../resources/createResource'
import {createStateSourceAction, type StateSource} from '../resources/createStateSourceAction'
import {getDraftId} from '../utils/ids'
import {type DocumentAction} from './actions'
import {INITIAL_OUTGOING_THROTTLE_TIME} from './documentConstants'
import {type DocumentEvent, getDocumentEvents} from './events'
import {listen, OutOfSyncError} from './listen'
import {type DocumentHandle, type JsonMatch, jsonMatch, type JsonMatchPath} from './patchOperations'
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
import {createFetchDocument, createSharedListener} from './sharedListener'

export interface DocumentStoreState {
  documentStates: {[TDocumentId in string]?: DocumentState}
  queued: QueuedTransaction[]
  applied: AppliedTransaction[]
  outgoing?: OutgoingTransaction
  grants?: Record<Grant, ExprNode>
  error?: unknown
  sharedListener: Observable<ListenEvent<SanityDocument>>
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

export const documentStore = createResource<DocumentStoreState>({
  name: 'Document',
  getInitialState: (instance) => ({
    documentStates: {},
    // these can be emptied on refetch
    queued: [],
    applied: [],
    sharedListener: createSharedListener(instance, {
      apiVersion: API_VERSION,
      projectId: instance.resources[0].projectId,
      dataset: instance.resources[0].dataset,
    }),
    fetchDocument: createFetchDocument(instance),
    events: new Subject(),
  }),
  initialize() {
    const queuedTransactionSubscription = subscribeToQueuedAndApplyNextTransaction(this)
    const subscriptionsSubscription = subscribeToSubscriptionsAndListenToDocuments(this)
    const appliedSubscription = subscribeToAppliedAndSubmitNextTransaction(this)
    const clientSubscription = subscribeToClientAndFetchDatasetAcl(this)

    return () => {
      queuedTransactionSubscription.unsubscribe()
      subscriptionsSubscription.unsubscribe()
      appliedSubscription.unsubscribe()
      clientSubscription.unsubscribe()
    }
  },
})

/** @beta */
export function getDocumentState<
  TDocument extends SanityDocument,
  TPath extends JsonMatchPath<TDocument>,
>(
  instance: SanityInstance | ActionContext<DocumentStoreState>,
  doc: string | DocumentHandle<TDocument>,
  path: TPath,
): StateSource<JsonMatch<TDocument, TPath> | undefined>
/** @beta */
export function getDocumentState<TDocument extends SanityDocument>(
  instance: SanityInstance | ActionContext<DocumentStoreState>,
  doc: string | DocumentHandle<TDocument>,
): StateSource<TDocument | null>
/** @beta */
export function getDocumentState(
  instance: SanityInstance | ActionContext<DocumentStoreState>,
  doc: string | DocumentHandle,
  path?: string,
): StateSource<unknown>
/** @beta */
export function getDocumentState(
  ...args: Parameters<typeof _getDocumentState>
): StateSource<unknown> {
  return _getDocumentState(...args)
}
const _getDocumentState = createStateSourceAction(documentStore, {
  selector: ({error, documentStates}, doc: string | DocumentHandle, path?: string) => {
    const documentId = typeof doc === 'string' ? doc : doc._id
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
  onSubscribe: ({state}, doc: string | DocumentHandle) =>
    manageSubscriberIds(state, typeof doc === 'string' ? doc : doc._id),
})

/** @beta */
export function resolveDocument<TDocument extends SanityDocument>(
  instance: SanityInstance | ActionContext<DocumentStoreState>,
  doc: string | DocumentHandle<TDocument>,
): Promise<TDocument | null>
/** @beta */
export function resolveDocument(
  instance: SanityInstance | ActionContext<DocumentStoreState>,
  doc: string | DocumentHandle,
): Promise<SanityDocument | null>
/** @beta */
export function resolveDocument(
  ...args: Parameters<typeof _resolveDocument>
): Promise<SanityDocument | null> {
  return _resolveDocument(...args)
}
const _resolveDocument = createAction(documentStore, () => {
  return function (doc: string | DocumentHandle) {
    const documentId = typeof doc === 'string' ? doc : doc._id
    return firstValueFrom(
      getDocumentState(this, documentId).observable.pipe(filter((i) => i !== undefined)),
    )
  }
})

/** @beta */
export const getDocumentSyncStatus = createStateSourceAction(documentStore, {
  selector: (
    {error, documentStates: documents, outgoing, applied, queued},
    doc: string | DocumentHandle,
  ) => {
    const documentId = typeof doc === 'string' ? doc : doc._id
    if (error) throw error
    const draftId = getDraftId(documentId)
    const publishedId = getPublishedId(documentId)

    const draft = documents[draftId]
    const published = documents[publishedId]

    if (draft === undefined || published === undefined) return undefined
    return !queued.length && !applied.length && !outgoing
  },
  onSubscribe: ({state}, doc: string | DocumentHandle) =>
    manageSubscriberIds(state, typeof doc === 'string' ? doc : doc._id),
})

/** @beta */
export const getPermissionsState = createStateSourceAction(documentStore, {
  selector: calculatePermissions,
  onSubscribe: ({state}, actions) => manageSubscriberIds(state, getDocumentIdsFromActions(actions)),
})

/** @beta */
export const resolvePermissions = createAction(documentStore, () => {
  return function (actions: DocumentAction | DocumentAction[]) {
    return firstValueFrom(
      getPermissionsState(this, actions).observable.pipe(filter((i) => i !== undefined)),
    )
  }
})

/** @beta */
export const subscribeDocumentEvents = createAction(documentStore, ({state}) => {
  const {events} = state.get()

  return function (eventHandler: (e: DocumentEvent) => void): () => void {
    const subscription = events.subscribe(eventHandler)
    return () => subscription.unsubscribe()
  }
})

const subscribeToQueuedAndApplyNextTransaction = createInternalAction(
  ({state}: ActionContext<DocumentStoreState>) => {
    const {events} = state.get()

    return function () {
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
  },
)

const subscribeToAppliedAndSubmitNextTransaction = createInternalAction(
  ({state, instance}: ActionContext<DocumentStoreState>) => {
    const {events} = state.get()

    return function () {
      const client$ = new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {
          apiVersion: API_VERSION,
          projectId: instance.resources[0].projectId,
          dataset: instance.resources[0].dataset,
        }).subscribe(observer),
      )

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
          withLatestFrom(client$),
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
  },
)

const subscribeToSubscriptionsAndListenToDocuments = createInternalAction(
  ({state}: ActionContext<DocumentStoreState>) => {
    const {events} = state.get()

    return function () {
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
                return listen(this, e.id).pipe(
                  catchError((error) => {
                    // retry on `OutOfSyncError`
                    if (error instanceof OutOfSyncError) listen(this, e.id)
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
  },
)

const subscribeToClientAndFetchDatasetAcl = createInternalAction(
  ({instance, state}: ActionContext<DocumentStoreState>) => {
    const {projectId, dataset} = instance.identity
    const client$ = new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: API_VERSION}).subscribe(observer),
    )

    return function () {
      return client$
        .pipe(
          switchMap((client) =>
            client.observable.request<DatasetAcl>({
              uri: `/projects/${projectId}/datasets/${dataset}/acl`,
              // TODO: audit tags
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
  },
)
