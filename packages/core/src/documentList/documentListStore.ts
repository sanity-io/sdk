import type {SyncTag} from '@sanity/client'
import type {SortOrderingItem} from '@sanity/types'
import {createSelector} from 'reselect'

import {createAction} from '../resources/createAction'
import {createResource} from '../resources/createResource'
import {createStateSourceAction} from '../resources/createStateSourceAction'
import {createStore} from '../resources/createStore'
import {PAGE_SIZE} from './documentListConstants'
import {subscribeToLiveClientAndSetLastLiveEventId} from './subscribeToLiveClientAndSetLastLiveEventId'
import {subscribeToStateAndFetchResults} from './subscribeToStateAndFetchResults'

/**
 * Configuration options for filtering and sorting documents in a document list.
 * @public
 */
export interface DocumentListOptions {
  /** GROQ filter expression to query specific documents */
  filter?: string
  /** Array of sort ordering specifications to determine the order of results */
  sort?: SortOrderingItem[]
  /** The Content Lake perspective to use for this list. Defaults to `previewDrafts`. */
  perspective?: string
}

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
 * @public
 */
export interface DocumentListState {
  options: DocumentListOptions
  lastLiveEventId?: string
  syncTags: SyncTag[]
  limit: number
  count: number
  results: DocumentHandle[]
  isPending: boolean
}

export function getDocumentList(): typeof documentList {
  return documentList
}

export const documentList = createResource<DocumentListState>({
  name: 'documentList',
  getInitialState: () => ({
    limit: PAGE_SIZE,
    options: {perspective: 'previewDrafts'},
    results: [],
    syncTags: [],
    isPending: false,
    count: 0,
  }),
  initialize() {
    const stateSubscription = subscribeToStateAndFetchResults(this)
    const liveClientSubscription = subscribeToLiveClientAndSetLastLiveEventId(this)

    return () => {
      stateSubscription.unsubscribe()
      liveClientSubscription.unsubscribe()
    }
  },
})

const getState = createStateSourceAction(
  getDocumentList,
  createSelector(
    [
      (state: DocumentListState) => state.results,
      (state: DocumentListState) => state.count,
      (state: DocumentListState) => state.isPending,
    ],
    (results, count, isPending) => ({
      results,
      isPending,
      count,
      hasMore: results.length < count,
    }),
  ),
)

const setOptions = createAction(getDocumentList, ({state}) => {
  return function (options: DocumentListOptions) {
    state.set('setOptions', (prev) => ({
      options: {
        ...prev.options,
        ...options,
      },
    }))
  }
})

const loadMore = createAction(getDocumentList, ({state}) => {
  return function () {
    state.set('loadMore', (prev) => ({limit: prev.limit + PAGE_SIZE}))
  }
})

/**
 * @public
 */
export const createDocumentListStore = createStore(documentList, {
  getState,
  loadMore,
  setOptions,
})
