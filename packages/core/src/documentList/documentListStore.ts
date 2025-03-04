import {type SyncTag} from '@sanity/client'
import {type SortOrderingItem} from '@sanity/types'
import {createSelector} from 'reselect'

import {type SanityInstance} from '../instance/types'
import {createAction, type ResourceAction} from '../resources/createAction'
import {createResource} from '../resources/createResource'
import {createStateSourceAction, type StateSource} from '../resources/createStateSourceAction'
import {type BoundActions, createStore} from '../resources/createStore'
import {PAGE_SIZE} from './documentListConstants'
import {subscribeToLiveClientAndSetLastLiveEventId} from './subscribeToLiveClientAndSetLastLiveEventId'
import {subscribeToStateAndFetchResults} from './subscribeToStateAndFetchResults'

/**
 * Configuration options for filtering and sorting documents in a document list.
 * @public
 */
export interface DocumentListOptions {
  /** The resource ID in format 'projectId:datasetId' */
  datasetResourceId: DatasetResourceId
  /** GROQ filter expression to query specific documents */
  filter?: string
  /** Array of sort ordering specifications to determine the order of results */
  sort?: SortOrderingItem[]
  /** The Content Lake perspective to use for this list. Defaults to `previewDrafts`. */
  perspective?: string
}

/**
 * The resource ID in format 'projectId:datasetId'
 * @public
 */
export type DatasetResourceId = `${string}:${string}` | undefined

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

type DocumentListActions = {
  getState: ResourceAction<
    DocumentListState,
    [],
    StateSource<{
      results: DocumentHandle[]
      isPending: boolean
      count: number
      hasMore: boolean
    }>
  >
  loadMore: ResourceAction<DocumentListState, [], void>
  setOptions: ResourceAction<DocumentListState, [options: DocumentListOptions], void>
}

/**
 * Creates a document list store with a specific datasetResourceId
 * @param instance - The Sanity instance
 * @param datasetResourceId - The resource ID in format 'projectId:datasetId'
 * @public
 */
export function createDocumentListStore(
  instance: SanityInstance,
  datasetResourceId: DatasetResourceId,
): {dispose: () => void} & BoundActions<DocumentListActions> {
  const documentList = createResource<DocumentListState>({
    name: `documentList_${datasetResourceId}`,
    getInitialState: () => ({
      limit: PAGE_SIZE,
      options: {
        datasetResourceId,
        perspective: 'previewDrafts',
      },
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

  const store = createStore(documentList, {
    getState: createStateSourceAction(
      documentList,
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
    ),
    loadMore: createAction(documentList, ({state}) => {
      return function () {
        state.set('loadMore', (prev) => ({limit: prev.limit + PAGE_SIZE}))
      }
    }),
    setOptions: createAction(documentList, ({state}) => {
      return function (options: DocumentListOptions) {
        state.set('setOptions', (prev) => ({
          options: {
            ...prev.options,
            ...options,
            datasetResourceId, // Always set the resourceId to original resourceId
          },
        }))
      }
    }),
  })(instance)

  return store
}
