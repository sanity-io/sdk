import {createDocumentListStore, type DocumentHandle, type DocumentListOptions} from '@sanity/sdk'
import {useCallback, useEffect, useState, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 */
export interface DocumentCollection {
  /** Retrieve more documents matching the provided options */
  loadMore: () => void
  /** The retrieved document handles of the documents matching the provided options */
  results: DocumentHandle[]
  /** Whether a retrieval of documents is in flight */
  isPending: boolean
  /** Whether more documents exist that match the provided options than have been retrieved */
  hasMore: boolean
  /** The total number of documents in the collection */
  count: number
}

type DocumentListStore = ReturnType<typeof createDocumentListStore>
type DocumentListState = ReturnType<DocumentListStore['getState']>['getCurrent']
const STABLE_EMPTY = {
  results: [],
  isPending: false,
  hasMore: false,
  count: 0,
}

/**
 * @public
 *
 * The `useDocuments` hook retrieves and provides access to a live collection of documents, optionally filtered, sorted, and matched to a given Content Lake perspective.
 * Because the returned document collection is live, the results will update in real time until the component invoking the hook is unmounted.
 *
 * @param options - Options for narrowing and sorting the document collection
 * @returns The collection of documents matching the provided options (if any), as well as properties describing the collection and a function to load more.
 *
 * @example Retrieving all documents of type 'movie'
 * ```
 * const { results, isPending } = useDocuments({ filter: '_type == "movie"' })
 *
 * return (
 *   <div>
 *     <h1>Movies</h1>
 *     {results && (
 *       <ul>
 *         {results.map(movie => (<li key={movie._id}>…</li>))}
 *       </ul>
 *     )}
 *     {isPending && <div>Loading movies…</div>}
 *   </div>
 * )
 * ```
 *
 * @example Retrieving all movies released since 1980, sorted by director’s last name
 * ```
 * const { results } = useDocuments({
 *   filter: '_type == "movie" && releaseDate >= "1980-01-01"',
 *   sort: [
 *     {
 *       // Expand the `director` reference field with the dereferencing operator `->`
 *       field: 'director->lastName',
 *       sort: 'asc',
 *     },
 *   ],
 * })
 *
 * return (
 *   <div>
 *      <h1>Movies released since 1980</h1>
 *      {results && (
 *        <ol>
 *          {results.map(movie => (<li key={movie._id}>…</li>))}
 *        </ol>
 *     )}
 *   </div>
 * )
 * ```
 */
export function useDocuments(options: DocumentListOptions = {}): DocumentCollection {
  const instance = useSanityInstance()

  // NOTE: useState is used because it guaranteed to return a stable reference
  // across renders
  const [ref] = useState<{
    storeInstance: DocumentListStore | null
    getCurrent: DocumentListState
    initialOptions: DocumentListOptions
  }>(() => ({
    storeInstance: null,
    getCurrent: () => STABLE_EMPTY,
    initialOptions: options,
  }))

  // serialize options to ensure it only calls `setOptions` when the values
  // themselves changes (in cases where devs put config inline)
  const serializedOptions = JSON.stringify(options)
  useEffect(() => {
    ref.storeInstance?.setOptions(JSON.parse(serializedOptions))
  }, [ref, serializedOptions])

  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      // to match the lifecycle of `useSyncExternalState`, we create the store
      // instance after subscribe and mutate the ref to connect everything
      ref.storeInstance = createDocumentListStore(instance)
      ref.storeInstance.setOptions(ref.initialOptions)
      const state = ref.storeInstance.getState()
      ref.getCurrent = state.getCurrent
      const unsubscribe = state.subscribe(onStoreChanged)

      return () => {
        // unsubscribe to clean up the state subscriptions
        unsubscribe()
        // dispose of the instance
        ref.storeInstance?.dispose()
      }
    },
    [instance, ref],
  )

  const getSnapshot = useCallback(() => {
    return ref.getCurrent()
  }, [ref])

  const state = useSyncExternalStore(subscribe, getSnapshot)

  const loadMore = useCallback(() => {
    ref.storeInstance?.loadMore()
  }, [ref])

  return {loadMore, ...state}
}
