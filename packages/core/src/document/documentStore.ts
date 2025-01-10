import type {SanityClient} from '@sanity/client'
import {type Mutation, SanityEncoder} from '@sanity/mutate'
import {
  createDocumentEventListener,
  createDocumentLoader, createDocumentLoaderFromClient,
  createOptimisticStore,
  createSharedListener, createSharedListenerFromClient,
  type OptimisticStore
} from '@sanity/mutate/_unstable_store'
import type {SanityDocumentLike} from '@sanity/types'
import {omit} from 'lodash-es'
import {
  combineLatest,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  filter,
  firstValueFrom,
  from,
  groupBy,
  map,
  mergeMap,
  Observable,
  of,
  pairwise,
  type Subscription,
  switchMap,
  tap,
  throttleTime,
  withLatestFrom,
} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import type {DocumentHandle} from '../documentList/documentListStore'
import {randomId} from '../preview/util'
import {createAction, createInternalAction} from '../resources/createAction'
import {createResource} from '../resources/createResource'
import {createStateSourceAction, type StateSource} from '../resources/createStateSourceAction'

const SUBMIT_THROTTLE_TIME = 100
const API_VERSION = '2023-10-27'

export interface DocumentStoreState {
  documents: Record<string, SanityDocumentLike | undefined>
  activeDocumentSubscriptions: Record<string, string[] | undefined>
  optimisticStore: OptimisticStore | null
  lastMutation: number | null
}

export const getDocumentStore = () => documentStore

const initialState: DocumentStoreState = {
  optimisticStore: null,
  activeDocumentSubscriptions: {},
  documents: {},
  lastMutation: null,
}

export const documentStore = createResource<DocumentStoreState>({
  name: 'Document',
  getInitialState: () => initialState,
  initialize() {
    const clientsSubscription = subscribeToClientsAndCreateOptimisticStore(this)
    const activeDocumentsSubscription = subscribeToStateAndListenToActiveDocuments(this)
    const mutationSubmissionsSubscription = subscribeToStateAndSubmitMutations(this)

    return () => {
      clientsSubscription.unsubscribe()
      activeDocumentsSubscription.unsubscribe()
      mutationSubmissionsSubscription.unsubscribe()
    }
  },
})

export interface GetDocumentStateOptions {
  document: DocumentHandle
}

const _getDocumentState = createStateSourceAction(
  getDocumentStore,
  (state: DocumentStoreState, {document}: GetDocumentStateOptions) => state.documents[document._id],
)

export const getDocumentState = createAction(getDocumentStore, ({state}) => {
  return function (options: GetDocumentStateOptions): StateSource<SanityDocumentLike | undefined> {
    const documentState = _getDocumentState(this, options)
    const documentId = options.document._id

    return {
      ...documentState,
      subscribe: (onStoreChanged) => {
        const unsubscribe = documentState.subscribe(onStoreChanged)
        const subscriptionId = randomId()

        state.set('addDocumentSubscription', (prev) => ({
          activeDocumentSubscriptions: {
            ...prev.activeDocumentSubscriptions,
            [documentId]: [
              ...(prev.activeDocumentSubscriptions?.[documentId] ?? []),
              subscriptionId,
            ],
          },
        }))

        return () => {
          unsubscribe()

          state.set('removeDocumentSubscription', (prev) => {
            const documentSubscriptions = prev.activeDocumentSubscriptions[documentId]
            const nextSubscriptions = documentSubscriptions?.filter((id) => id !== subscriptionId)

            return {
              activeDocumentSubscriptions: nextSubscriptions?.length
                ? {...prev.activeDocumentSubscriptions, [documentId]: nextSubscriptions}
                : omit(prev.activeDocumentSubscriptions, documentId),
            }
          })
        }
      },
    }
  }
})

const isNonNullable = <T>(t: T): t is NonNullable<T> => !!t

const subscribeToStateAndListenToActiveDocuments = createInternalAction<
  DocumentStoreState,
  [],
  Subscription
>(({state}) => {
  const optimisticStore$ = state.observable.pipe(
    map((s) => s.optimisticStore),
    filter(isNonNullable),
    distinctUntilChanged(),
  )

  // we need a stream of documents and then…
  const subscriptionChanges$ = state.observable.pipe(
    map((s) => Object.keys(s.activeDocumentSubscriptions)),
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

      return of<{id: string; type: 'add' | 'remove'}[]>(
        ...added.map((id) => ({id, type: 'add'}) as const),
        ...removed.map((id) => ({id, type: 'remove'}) as const),
      )
    }),
    groupBy((i) => i.id),
  )

  const document$ = combineLatest([subscriptionChanges$, optimisticStore$]).pipe(
    mergeMap(([subscriptionChange, optimisticStore]) =>
      subscriptionChange.pipe(
        switchMap(({type, id}) =>
          type === 'add' ? optimisticStore.listen(id).pipe(map((value) => ({id, value}))) : EMPTY,
        ),
      ),
    ),
    tap((e) => console.log('document stream', e)),
  )

  return function () {
    return document$.subscribe({
      next: ({id, value}) => {
        state.set('updateDocumentValue', (prev) => ({
          documents: value
            ? {...prev.documents, [id]: value as SanityDocumentLike}
            : omit(prev.documents, id),
        }))
      },
      error: () => {
        // TODO:
      },
    })
  }
})

const subscribeToClientsAndCreateOptimisticStore = createInternalAction<
  DocumentStoreState,
  [],
  Subscription
>(({state, instance}) => {
  const client$ = new Observable<SanityClient>((observer) =>
    getSubscribableClient(instance, {apiVersion: API_VERSION}).subscribe(observer),
  )

  return function () {
    return client$.subscribe({
      next: (client) => {
        const sharedListener = createSharedListenerFromClient(client)
        const loadDocument = createDocumentLoaderFromClient(client)
        const listen = createDocumentEventListener({
          loadDocument,
          listenerEvents: sharedListener,
        })

        const optimisticStore = createOptimisticStore({
          listen,
          submit: (transactions) => {
            return from(transactions).pipe(
              concatMap((transaction) =>
                client.dataRequest('mutate', SanityEncoder.encodeTransaction(transaction), {
                  visibility: 'async',
                  returnDocuments: false,
                }),
              ),
            )
          },
        })

        state.set('setOptimisticStore', {optimisticStore})
      },
      error: () => {
        // TODO:
      },
    })
  }
})

const subscribeToStateAndSubmitMutations = createInternalAction<
  DocumentStoreState,
  [],
  Subscription
>(({state}) => {
  const optimisticStore$ = state.observable.pipe(
    map((s) => s.optimisticStore),
    filter(isNonNullable),
    distinctUntilChanged(),
    tap(console.log),
  )

  const submissions$ = state.observable.pipe(
    map((s) => s.lastMutation),
    filter((last) => typeof last === 'number'),
    distinctUntilChanged(),
    throttleTime(SUBMIT_THROTTLE_TIME, undefined, {trailing: true}),
    withLatestFrom(optimisticStore$),
    tap(() => console.log('before submit')),
    mergeMap(([, optimisticStore]) => from(optimisticStore.submit())),
    tap(() => console.log('after submit')),
  )

  return function () {
    return submissions$.subscribe({
      // TODO:
      error: console.error,
    })
  }
})

export const mutate = createAction(getDocumentStore, ({state}) => {
  const optimisticStore$ = state.observable.pipe(
    map((s) => s.optimisticStore),
    filter(isNonNullable),
    distinctUntilChanged(),
  )

  return async function (mutation: Mutation[]) {
    const optimisticStore = await firstValueFrom(optimisticStore$)
    optimisticStore.mutate(mutation)
    state.set('updateLastMutation', {lastMutation: Date.now()})
  }
})

// add => from local
// arrive => from server
