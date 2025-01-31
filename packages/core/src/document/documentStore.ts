import {type ListenEvent, SanityClient} from '@sanity/client'
import {getPublishedId} from '@sanity/client/csm'
import {
  type Mutation,
  type PatchOperations,
  type SanityDocument,
  type SanityDocumentLike,
} from '@sanity/types'
import {omit} from 'lodash-es'
import {createSelector} from 'reselect'
import {
  catchError,
  concatMap,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  firstValueFrom,
  map,
  Observable,
  Subject,
  tap,
} from 'rxjs'

import {getDraftId, randomId} from '../preview/util'
import {type ActionContext, createAction, createInternalAction} from '../resources/createAction'
import {createResource} from '../resources/createResource'
import {createStateSourceAction} from '../resources/createStateSourceAction'
import {type DocumentAction} from './actions'
import {ActionError} from './applyActionsFromBase'
import {type DocumentSet} from './applyMutations'
import {applyTransaction} from './applyTransaction'
import {jsonMatch} from './patchOperations'
import {createFetchDocument, createSharedListener} from './sharedListener'
import {subscribeToAppliedAndSubmitNextTransaction} from './subscribeToAppliedAndSubmitNextTransaction'
import {subscribeToSubscriptionsAndListenToDocuments} from './subscribeToSubscriptionsAndListenToDocuments'

/**
 * When a document has no more subscribers, its state is cleaned up and removed
 * from the store. A delay used to prevent re-creating resources when the last
 * subscriber is removed quickly before another one is added. This is helpful
 * when used in a frontend where components may suspend or transition to
 * different views quickly.
 */
const DOCUMENT_STATE_CLEAR_DELAY = 1000

export interface DocumentStoreState {
  // TODO: might be better to rename to `documentsState`
  documents: {[TDocumentId in string]?: DocumentState}
  queued: QueuedTransaction[]
  applied: AppliedTransaction[]
  outgoing: OutgoingTransaction[]
  error?: unknown
  sharedListener: Observable<ListenEvent<SanityDocument>>
  fetchDocument: (documentId: string) => Observable<SanityDocument | null>
  events: Subject<DocumentEvent>
}

export type SyncTransactionState = Pick<
  DocumentStoreState,
  'queued' | 'applied' | 'documents' | 'outgoing'
>

export interface DocumentState {
  id: string
  /**
   * the "base" local copy that matches the server. represents the last known
   * server state. this gets updated every time we confirm remote patches
   */
  base?: SanityDocument | null
  /**
   * the current ephemeral working copy that includes local optimistic changes
   * that have not yet been confirmed by the server
   */
  local?: SanityDocument | null
  /**
   * the revision that our base document is at
   */
  baseRev?: string | null
  /**
   * Array of subscription IDs. This document state will be deleted if there are
   * no subscribers.
   */
  subscriptions: string[]

  unverifiedTransactions: {[TTransactionId in string]?: UnverifiedDocumentTransaction}
}

type ActionMap = {
  create: 'sanity.action.document.version.create'
  discard: 'sanity.action.document.version.discard'
  unpublish: 'sanity.action.document.unpublish'
  delete: 'sanity.action.document.delete'
  edit: 'sanity.action.document.edit'
  publish: 'sanity.action.document.publish'
}

type OptimisticLock = {
  ifDraftRevisionId?: string
  ifPublishedRevisionId?: string
}

export type HttpAction =
  | {actionType: ActionMap['create']; publishedId: string; attributes: SanityDocumentLike}
  | {actionType: ActionMap['discard']; versionId: string; purge?: boolean}
  | {actionType: ActionMap['unpublish']; draftId: string; publishedId: string}
  | {actionType: ActionMap['delete']; publishedId: string; includeDrafts?: string[]}
  | {actionType: ActionMap['edit']; draftId: string; publishedId: string; patch: PatchOperations}
  | ({actionType: ActionMap['publish']; draftId: string; publishedId: string} & OptimisticLock)

export interface QueuedTransaction {
  transactionId: string
  actions: DocumentAction[]
}

export interface AppliedTransaction {
  transactionId: string
  actions: DocumentAction[]
  outgoingActions: HttpAction[]
  outgoingMutations: Mutation[]
  base: DocumentSet
  working: DocumentSet
  previous: DocumentSet
  previousRevs: {[TDocumentId in string]?: string}
}

export interface OutgoingTransaction {
  transactionId: string
  actions: DocumentAction[]
  outgoingActions: HttpAction[]
  outgoingMutations: Mutation[]
  shouldBatch: boolean
  consumedTransactions: string[]
  previousRevs: {[TDocumentId in string]?: string}
  previous: DocumentSet
  base: DocumentSet
  working: DocumentSet
}

export interface UnverifiedDocumentTransaction {
  transactionId: string
  documentId: string
  previousRev: string
}

export type DocumentEvent =
  | ActionErrorEvent
  | TransactionRevertedEvent
  | TransactionSubmittedEvent
  | DocumentEditedEvent
  | DocumentCreatedEvent
  | DocumentDeletedEvent
  | DocumentPublishedEvent
  | DocumentUnpublishedEvent
  | DocumentDiscardedEvent

export interface ActionErrorEvent {
  type: 'error'
  documentId: string
  transactionId: string
  message: string
  error: unknown
}
export interface TransactionSubmittedEvent {
  type: 'submitted'
  transactionId: string
  result: Awaited<ReturnType<SanityClient['action']>>
}
export interface TransactionRevertedEvent {
  type: 'reverted'
  transactionId: string
  message: string
  error: unknown
}

export interface DocumentEditedEvent {
  type: 'edited'
  documentId: string
  transactionId: string
}
export interface DocumentCreatedEvent {
  type: 'created'
  documentId: string
  transactionId: string
}
export interface DocumentDeletedEvent {
  type: 'deleted'
  documentId: string
  transactionId: string
}
export interface DocumentPublishedEvent {
  type: 'published'
  documentId: string
  transactionId: string
}
export interface DocumentUnpublishedEvent {
  type: 'unpublished'
  documentId: string
  transactionId: string
}
export interface DocumentDiscardedEvent {
  type: 'discarded'
  documentId: string
  transactionId: string
}

export const documentStore = createResource<DocumentStoreState>({
  name: 'Document',
  getInitialState: (instance) => ({
    documents: {},
    queued: [],
    // these can be emptied on refetch
    applied: [],
    outgoing: [],
    unverified: {},
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

export function handleSubscribe(
  {state}: ActionContext<DocumentStoreState>,
  documentId: string,
  _path?: string,
): () => void {
  const subscriptionId = randomId()
  const draftId = getDraftId(documentId)
  const publishedId = getPublishedId(documentId)

  state.set('addSubscriber', (prev) => {
    const prevPublished = prev.documents?.[publishedId]
    const prevPublishedSubscriptions = prevPublished?.subscriptions ?? []
    const prevDraft = prev.documents?.[draftId]
    const prevDraftSubscriptions = prevDraft?.subscriptions ?? []

    return {
      documents: {
        ...prev.documents,
        [draftId]: {
          ...prevDraft,
          unverifiedTransactions: prevDraft?.unverifiedTransactions ?? {},
          id: documentId,
          subscriptions: [...prevDraftSubscriptions, subscriptionId],
        },
        [publishedId]: {
          ...prevPublished,
          unverifiedTransactions: prevPublished?.unverifiedTransactions ?? {},
          id: documentId,
          subscriptions: [...prevPublishedSubscriptions, subscriptionId],
        },
      },
    }
  })

  return () => {
    setTimeout(() => {
      state.set('removeSubscriber', (prev) => {
        const prevDraft = prev.documents?.[draftId]
        const prevPublished = prev.documents?.[publishedId]

        const prevDraftSubscriptions = prevDraft?.subscriptions ?? []
        const prevPublishedSubscriptions = prevPublished?.subscriptions ?? []

        const draftSubscriptions = prevDraftSubscriptions.filter((id) => id !== subscriptionId)
        const publishedSubscriptions = prevPublishedSubscriptions.filter(
          (id) => id !== subscriptionId,
        )

        let documents = prev.documents

        documents = {
          ...documents,
          ...(prevDraft && {
            [draftId]: {...prevDraft, subscriptions: draftSubscriptions},
          }),
          ...(prevPublished && {
            [publishedId]: {...prevPublished, subscriptions: publishedSubscriptions},
          }),
        }

        if (!publishedSubscriptions.length) {
          documents = omit(documents, publishedId)
        }
        if (!draftSubscriptions.length) {
          documents = omit(documents, draftId)
        }

        return {documents}
      })
    }, DOCUMENT_STATE_CLEAR_DELAY)
  }
}

export const getDocumentState = createStateSourceAction(documentStore, {
  selector: ({error, documents}, documentId, path?: string) => {
    if (error) throw error
    const draftId = getDraftId(documentId)
    const publishedId = getPublishedId(documentId)

    const draft = documents[draftId]?.local
    const published = documents[publishedId]?.local

    const document = draft ?? published
    if (document === undefined) return undefined

    if (path) {
      return jsonMatch({input: document, pathExpression: path}).at(0)?.value
    }

    return document
  },
  onSubscribe: handleSubscribe,
})

export const getDocumentConsistencyStatus = createStateSourceAction(documentStore, {
  selector: ({error, documents, outgoing}, documentId: string) => {
    if (error) throw error
    const draftId = getDraftId(documentId)
    const publishedId = getPublishedId(documentId)

    const draft = documents[draftId]
    const published = documents[publishedId]

    if (draft === undefined || published === undefined) return undefined
    return draft.local === draft.base && published.local === published.base && !outgoing.length
  },
  onSubscribe: handleSubscribe,
})

export const getDocumentPairState = createStateSourceAction(documentStore, {
  selector: createSelector(
    [
      (state: DocumentStoreState) => state.error,
      (state: DocumentStoreState, documentId: string) =>
        state.documents[getPublishedId(documentId)]?.local,
      (state: DocumentStoreState, documentId: string) =>
        state.documents[getDraftId(documentId)]?.local,
    ],
    (error, published, draft) => {
      if (error) throw error
      return {published, draft}
    },
  ),
  onSubscribe: handleSubscribe,
})

export const resolveDocument = createAction(documentStore, () => {
  return function (documentId: string) {
    return firstValueFrom(
      getDocumentState(this, documentId).observable.pipe(filter((doc) => doc !== undefined)),
    )
  }
})

export const subscribeToQueuedAndApplyNextTransaction = createInternalAction(
  ({state}: ActionContext<DocumentStoreState>) => {
    const {events} = state.get()
    return function () {
      return state.observable
        .pipe(
          map((s) => s.queued[0]),
          filter(Boolean),
          distinctUntilChanged((a, b) => a.transactionId === b.transactionId),
          concatMap((transaction) =>
            defer(async () => {
              const workingEntries = await Promise.all(
                transaction.actions
                  .map((action) => action.documentId)
                  .map(async (id) => {
                    const {draft, published} = await firstValueFrom(
                      getDocumentPairState(this, id).observable.pipe(
                        filter((i) => i.draft !== undefined && i.published !== undefined),
                      ),
                    )

                    return [
                      [getDraftId(id), draft] as const,
                      [getPublishedId(id), published] as const,
                    ]
                  }),
              )
              return {transaction, working: Object.fromEntries(workingEntries.flat())}
            }),
          ),
          tap(({transaction, working}) => {
            state.set('applyTransaction', (prev) =>
              applyTransaction({transaction, working, ...prev}),
            )
          }),
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
