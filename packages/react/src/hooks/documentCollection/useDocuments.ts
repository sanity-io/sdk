import {
  createDocumentListStore,
  type DocumentHandle,
  type DocumentListOptions,
  type SortOrderingItem,
} from '@sanity/sdk'
import {useCallback, useEffect, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

// TODO: using DocumentListOptions for now, but might require more specific types
/**
 * @public
 */
export type UseDocumentsOptions = DocumentListOptions

/**
 * @public
 */
export interface UseDocuments {
  loadMore: () => void
  result: DocumentHandle[] | null
  isPending: boolean
  filter?: string
  sort?: SortOrderingItem[]
}

/**
 * Hook to get the list of documents for specified options
 *
 * @public
 *
 * @param options - options for the document list
 * @returns result of the document list and function to load more
 */
export function useDocuments(options: UseDocumentsOptions): UseDocuments {
  const instance = useSanityInstance()
  const documentListStore = useMemo(() => createDocumentListStore(instance), [instance])

  const serializedOptions = JSON.stringify(options)
  useEffect(() => {
    documentListStore.setOptions(JSON.parse(serializedOptions))
  }, [documentListStore, serializedOptions])

  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      const subscription = documentListStore.subscribe({
        next: onStoreChanged,
      })

      return () => subscription.unsubscribe()
    },
    [documentListStore],
  )

  const getCurrent = useCallback(() => documentListStore.getCurrent(), [documentListStore])

  const result = useSyncExternalStore(subscribe, getCurrent)

  return {
    ...result,
    loadMore: documentListStore.loadMore,
  }
}
