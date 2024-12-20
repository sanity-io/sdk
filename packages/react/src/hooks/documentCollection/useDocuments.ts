import {createDocumentListStore, type DocumentHandle, type DocumentListOptions} from '@sanity/sdk'
import {useCallback, useEffect, useState, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 */
export interface UseDocuments {
  loadMore: () => void
  results: DocumentHandle[]
  isPending: boolean
  hasMore: boolean
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
 * Hook to get the list of documents for specified options
 *
 * @public
 *
 * @param options - options for the document list
 * @returns result of the document list and function to load more
 */
export function useDocuments(options: DocumentListOptions = {}): UseDocuments {
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
