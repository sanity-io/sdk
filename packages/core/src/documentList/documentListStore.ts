import type {SyncTag} from '@sanity/client'
import {isEqual} from 'lodash-es'
import {
  distinctUntilChanged,
  map,
  Observable,
  pairwise,
  startWith,
  type Subscribable,
  switchMap,
  tap,
} from 'rxjs'
import {devtools} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'
import {getClientStore} from '../client/store/clientStore'

const PAGE_SIZE = 50

const API_VERSION = 'vX'

/**
 * Represents an identifier to a Sanity document, containing its `_id` to pull
 * the document from content lake and its `_type` to look up its schema type.
 * @public
 */
export interface DocumentHandle {
  _id: string
  _type: string
}

/**
 * Represents the current state of a document list, including the query options
 * and loading status.
 * @public
 */
export interface DocumentListState extends DocumentListOptions {
  /** Array of document handles in the current result set, or null if not yet loaded */
  result: DocumentHandle[] | null
  /** Indicates whether the document list is currently loading */
  isPending: boolean
}

/**
 * Represents a sort ordering configuration.
 * @public
 */
export interface SortOrderingItem {
  field: string
  direction: 'asc' | 'desc'
}

/**
 * Configuration options for filtering and sorting documents in a document list.
 * @public
 */
export interface DocumentListOptions {
  /** GROQ filter expression to query specific documents */
  filter?: string
  /** Array of sort ordering specifications to determine the order of results */
  sort?: SortOrderingItem[]
}

/**
 * Manages the state and operations for a list of Sanity documents.
 * Provides methods to update options, load more documents, and subscribe to
 * state changes.
 *
 * Implements a subscription model where you can register callback functions
 * to be notified when the document list state changes.
 * @public
 */
export interface DocumentListStore extends Subscribable<DocumentListState> {
  /** Updates the filtering and sorting options for the document list */
  setOptions: (options: DocumentListOptions) => void
  /** Retrieves the current state of the document list synchronously */
  getCurrent: () => DocumentListState
  /** Loads the next page of documents */
  loadMore: () => void
  /** Cleans up resources and subscriptions when the store is no longer needed */
  dispose: () => void
}

interface DocumentListInternalState extends DocumentListOptions {
  isPending: boolean
  lastLiveEventId?: string
  syncTags: Set<SyncTag>
  limit: number
  result: DocumentHandle[] | null
}

/**
 * Creates a `DocumentListStore` from a `SanityInstance`.
 *
 * @public
 *
 * See {@link SanityInstance} and {@link DocumentListStore}
 */
export function createDocumentListStore(instance: SanityInstance): DocumentListStore {
  const clientStore = getClientStore(instance)
  const clientStream$ = new Observable(
    clientStore.getClientEvents({apiVersion: API_VERSION}).subscribe,
  )

  const initialState: DocumentListInternalState = {
    syncTags: new Set<SyncTag>(),
    isPending: false,
    result: null,
    limit: PAGE_SIZE,
  }

  const store = createStore<DocumentListInternalState>()(
    devtools((..._unusedArgs) => initialState, {
      name: 'SanityDocumentListStore',
      enabled: true, // Should be process.env.NODE_ENV === 'development'
    }),
  )

  const liveSubscription = clientStream$
    .pipe(
      switchMap((client) => client.live.events({includeDrafts: true, tag: 'sdk.live-listener'})),
    )
    .subscribe({
      next: (event) => {
        const {syncTags} = store.getState()
        if (event.type === 'message' && event.tags.some((tag) => syncTags.has(tag))) {
          store.setState(
            {lastLiveEventId: event.id},
            false,
            'UPDATE_EVENT_ID_FROM_LIVE_CONTENT_API',
          )
        }
      },
    })

  const resultSubscription = new Observable<DocumentListInternalState>((observer) =>
    store.subscribe((state) => observer.next(state)),
  )
    .pipe(
      distinctUntilChanged((prev, current) => {
        if (prev.filter !== current.filter) return false
        if (prev.lastLiveEventId !== current.lastLiveEventId) return false
        if (!isEqual(prev.sort, current.sort)) return false
        if (prev.limit !== current.limit) return false
        return true
      }),
      tap(() => store.setState({isPending: true}, false, {type: 'START_FETCH'})),
      switchMap((state) => {
        const filter = state.filter ? `[${state.filter}]` : ''
        const order = state.sort
          ? `| order(${state.sort
              .map((ordering) =>
                [ordering.field, ordering.direction.toLowerCase()]
                  .map((str) => str.trim())
                  .filter(Boolean)
                  .join(' '),
              )
              .join(',')})`
          : ''

        return clientStream$.pipe(
          switchMap((client) =>
            client.observable.fetch(
              `*${filter}${order}[0..$__limit]{_id, _type}`,
              {__limit: state.limit},
              {
                filterResponse: false,
                returnQuery: false,
                lastLiveEventId: state.lastLiveEventId,
                tag: 'sdk.document-list',
                // // TODO: this should use the `previewDrafts` perspective for
                // // removing duplicates in the result set but the live content API
                // // does not currently return the correct sync tags. CLDX has
                // // planned to add perspective support to the live content API
                // // in december of 2024
                // perspective: 'previewDrafts'
              },
            ),
          ),
        )
      }),
    )
    .subscribe({
      next: ({syncTags, result}) => {
        store.setState(
          {
            syncTags: new Set(syncTags),
            result,
            isPending: false,
          },
          false,
          {type: 'UPDATE_FROM_FETCH'},
        )
      },
    })

  function setOptions({filter, sort}: DocumentListOptions) {
    store.setState(
      {
        // spreads properties only if they exist, preserving other state
        // properties set in the zustand store already
        ...(filter && {filter}),
        ...(sort && {sort}),
      },
      false,
      {type: 'SET_OPTIONS'},
    )
  }

  function loadMore() {
    store.setState((prev) => ({limit: prev.limit + PAGE_SIZE}), undefined, {type: 'LOAD_MORE'})
  }

  function getCurrent() {
    const {isPending, result, filter, sort} = store.getState()
    return {isPending, result, filter, sort}
  }

  const state$ = new Observable<DocumentListState>((observer) => {
    function emitCurrent() {
      const {isPending, result, filter, sort} = store.getState()
      observer.next({
        isPending,
        result,
        filter,
        sort,
      })
    }

    emitCurrent()
    return store.subscribe(emitCurrent)
  }).pipe(
    distinctUntilChanged((prev, curr) => {
      if (!isEqual(prev.sort, curr.sort)) return false
      if (prev.result !== curr.result) return false
      if (prev.filter !== curr.filter) return false
      if (prev.isPending !== curr.isPending) return false
      return true
    }),
    startWith(null),
    pairwise(),
    map((arg): DocumentListState => {
      // casting this since `curr` will never be null
      const [prev, curr] = arg as [DocumentListState | null, DocumentListState]
      if (!prev?.result) return curr
      if (!curr?.result) return curr

      const prevMap = prev.result.reduce<Map<string, DocumentHandle>>((acc, handle) => {
        acc.set(handle._id, handle)
        return acc
      }, new Map())

      return {
        ...curr,
        result: curr.result.map((i) => prevMap.get(i._id) ?? i),
      }
    }),
  )

  const subscribe = state$.subscribe.bind(state$)

  function dispose() {
    liveSubscription.unsubscribe()
    resultSubscription.unsubscribe()
  }

  return {setOptions, getCurrent, loadMore, subscribe, dispose}
}
