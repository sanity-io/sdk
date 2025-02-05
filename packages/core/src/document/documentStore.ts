import {type Action, type ListenEvent, SanityClient} from '@sanity/client'
import {getPublishedId} from '@sanity/client/csm'
import {type SanityDocument} from '@sanity/types'
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
  Subject,
  switchMap,
  tap,
  throttle,
  timer,
  withLatestFrom,
} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {API_VERSION} from '../documentList/documentListConstants'
import {getDraftId, randomId} from '../preview/util'
import {type ActionContext, createAction, createInternalAction} from '../resources/createAction'
import {createResource} from '../resources/createResource'
import {createStateSourceAction} from '../resources/createStateSourceAction'
import {DOCUMENT_STATE_CLEAR_DELAY, INITIAL_OUTGOING_THROTTLE_TIME} from './documentConstants'
import {type DocumentEvent, getDocumentEvents} from './events'
import {listen} from './listen'
import {jsonMatch} from './patchOperations'
import {ActionError} from './processActions'
import {
  addSubscriptionIdToDocument,
  type AppliedTransaction,
  applyFirstQueuedTransaction,
  applyRemoteDocument,
  type OutgoingTransaction,
  type QueuedTransaction,
  removeSubscriptionIdFromDocument,
  revertOutgoingTransaction,
  type SyncTransactionState,
  transitionAppliedTransactionsToOutgoing,
  type UnverifiedDocumentRevision,
} from './reducers'
import {createFetchDocument, createSharedListener} from './sharedListener'

export interface DocumentStoreState {
  documentStates: {[TDocumentId in string]?: DocumentState}
  queued: QueuedTransaction[]
  applied: AppliedTransaction[]
  outgoing?: OutgoingTransaction
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
    outgoing: undefined,
    sharedListener: createSharedListener(instance),
    fetchDocument: createFetchDocument(instance),
    events: new Subject(),
  }),
  initialize() {
    const queuedTransactionSubscription = subscribeToQueuedAndApplyNextTransaction(this)
    const subscriptionsSubscription = subscribeToSubscriptionsAndListenToDocuments(this)
    const appliedSubscription = subscribeToAppliedAndSubmitNextTransaction(this)

    return () => {
      queuedTransactionSubscription.unsubscribe()
      subscriptionsSubscription.unsubscribe()
      appliedSubscription.unsubscribe()
    }
  },
})

function addPairSubscriptionIds(
  {state}: ActionContext<DocumentStoreState>,
  documentId: string,
  _path?: string,
): () => void {
  const subscriptionId = randomId()
  state.set('addSubscribers', (prev) =>
    [getPublishedId(documentId), getDraftId(documentId)].reduce(
      (acc, id) => addSubscriptionIdToDocument(acc, id, subscriptionId),
      prev as SyncTransactionState,
    ),
  )

  return () => {
    setTimeout(() => {
      state.set('removeSubscribers', (prev) =>
        [getPublishedId(documentId), getDraftId(documentId)].reduce(
          (acc, id) => removeSubscriptionIdFromDocument(acc, id, subscriptionId),
          prev as SyncTransactionState,
        ),
      )
    }, DOCUMENT_STATE_CLEAR_DELAY)
  }
}

export const getDocumentState = createStateSourceAction(documentStore, {
  selector: ({error, documentStates: documents}, documentId, path?: string) => {
    if (error) throw error
    const draftId = getDraftId(documentId)
    const publishedId = getPublishedId(documentId)

    const draft = documents[draftId]?.local
    const published = documents[publishedId]?.local

    const document = draft ?? published
    if (document === undefined) return undefined
    if (path) return jsonMatch(document, path).at(0)?.value
    return document
  },
  onSubscribe: addPairSubscriptionIds,
})

export const getDocumentConsistencyStatus = createStateSourceAction(documentStore, {
  selector: ({error, documentStates: documents, outgoing, applied}, documentId: string) => {
    if (error) throw error
    const draftId = getDraftId(documentId)
    const publishedId = getPublishedId(documentId)

    const draft = documents[draftId]
    const published = documents[publishedId]

    if (draft === undefined || published === undefined) return undefined
    return !applied.length && !outgoing
  },
  onSubscribe: addPairSubscriptionIds,
})

export const resolveDocument = createAction(documentStore, () => {
  return function (documentId: string) {
    return firstValueFrom(
      getDocumentState(this, documentId).observable.pipe(filter((doc) => doc !== undefined)),
    )
  }
})

export const subscribeDocumentEvents = createAction(documentStore, ({state}) => {
  const {events} = state.get()

  return function (eventHandler: (e: DocumentEvent) => void): () => void {
    const subscription = events.subscribe(eventHandler)
    return () => subscription.unsubscribe()
  }
})

export const subscribeToQueuedAndApplyNextTransaction = createInternalAction(
  ({state}: ActionContext<DocumentStoreState>) => {
    const {events} = state.get()

    return function () {
      return state.observable
        .pipe(
          map(applyFirstQueuedTransaction),
          tap((next) => state.set('applyFirstQueuedTransaction', next)),
          catchError((error) => {
            if (error instanceof ActionError) {
              events.next({
                type: 'error',
                message: error.message,
                documentId: error.documentId,
                transactionId: error.transactionId,
                error,
              })
              state.set('removeFailedAction', (prev) => ({queued: prev.queued.slice(1)}))
              return EMPTY
            }

            throw error
          }),
        )
        .subscribe({error: (error) => state.set('setError', {error})})
    }
  },
)

export const subscribeToAppliedAndSubmitNextTransaction = createInternalAction(
  ({state, instance}: ActionContext<DocumentStoreState>) => {
    const {events} = state.get()

    return function () {
      const client$ = new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion: API_VERSION}).subscribe(observer),
      )

      return state.observable
        .pipe(
          throttle(
            (s) =>
              // if there is no outgoing transaction, we can throttle by the
              // initial outgoing throttle time
              !s.outgoing
                ? timer(INITIAL_OUTGOING_THROTTLE_TIME)
                : // otherwise, wait until the outgoing has been cleared
                  state.observable.pipe(first(({outgoing}) => !outgoing)),
            {leading: false, trailing: true},
          ),
          map(transitionAppliedTransactionsToOutgoing),
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
            state.set('removeOutgoing', {outgoing: undefined})
            for (const e of getDocumentEvents(outgoing)) events.next(e)
            events.next({type: 'accepted', outgoing, result})
          }),
        )
        .subscribe({error: (error) => state.set('setError', {error})})
    }
  },
)

export const subscribeToSubscriptionsAndListenToDocuments = createInternalAction(
  ({state}: ActionContext<DocumentStoreState>) => {
    return function () {
      return state.observable
        .pipe(
          map((s) => Object.keys(s.documentStates)),
          distinctUntilChanged((curr, next) => {
            if (curr.length !== next.length) return false
            const currSet = new Set(curr)
            return next.every((i) => currSet.has(i))
          }),
          pairwise(),
          switchMap((pair) => {
            const [curr, next] = pair.map((ids) => new Set(ids))
            const added = Array.from(next).filter((i) => !curr.has(i))
            const removed = Array.from(curr).filter((i) => !next.has(i))

            return of<{id: string; add: boolean}[]>(
              ...added.map((id) => ({id, add: true}) as const),
              ...removed.map((id) => ({id, add: false}) as const),
            )
          }),
          groupBy((i) => i.id),
          mergeMap((group) => group.pipe(switchMap((e) => (e.add ? listen(this, e.id) : EMPTY)))),
          tap((remote) =>
            state.set('applyRemoteDocument', (prev) => applyRemoteDocument(prev, remote)),
          ),
        )
        .subscribe({error: (error) => state.set('setError', {error})})
    }
  },
)
