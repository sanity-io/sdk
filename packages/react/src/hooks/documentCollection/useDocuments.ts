import {createDocumentListStore, type DocumentListOptions} from '@sanity/sdk'
import {useCallback, useEffect, useState, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {type DocumentHandleCollection} from './types'

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
 * Retrieves and provides access to a live collection of {@link DocumentHandle}s, with an optional filter and sort applied.
 * The returned document handles are canonical — that is, they refer to the document in its current state, whether draft, published, or within a release or perspective.
 * Because the returned document handle collection is live, the results will update in real time until the component invoking the hook is unmounted.
 *
 * @remarks
 * {@link DocumentHandle}s are used by many other hooks (such as {@link usePreview}, {@link useDocument}, and {@link useEditDocument})
 * to work with documents in various ways without the entire document needing to be fetched upfront.
 *
 * @category Documents
 * @param options - Options for narrowing and sorting the document collection
 * @returns The collection of document handles matching the provided options (if any), as well as properties describing the collection and a function to load more.
 *
 * @example Retrieving document handles for all documents of type 'movie'
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
 * @example Retrieving document handles for all movies released since 1980, sorted by director’s last name
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
export function useDocuments(options: DocumentListOptions = {}): DocumentHandleCollection {
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
