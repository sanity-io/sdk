import {type DocumentSource, getDocumentSyncStatus} from '@sanity/sdk'
import {useMemo} from 'react'

import {useSanityInstanceAndSource} from '../context/useSanityInstance'
import {useStoreState} from '../helpers/useStoreState'

type UseDocumentSyncStatus = {
  /**
   * Exposes the document's sync status between local and remote document states.
   *
   * @category Documents
   * @param doc - The document handle to get sync status for. If you pass a `DocumentHandle` with specified `projectId` and `dataset`,
   * the document will be read from the specified Sanity project and dataset that is included in the handle. If no `projectId` or `dataset` is provided,
   * the document will use the nearest instance from context.
   * @returns `true` if local changes are synced with remote, `false` if changes are pending. Note: Suspense handles loading states.
   * @example Show sync status indicator
   * ```tsx
   * import {useDocumentSyncStatus, createDocumentHandle, type DocumentHandle} from '@sanity/sdk-react'
   *
   * // Define props including the DocumentHandle type
   * interface SyncIndicatorProps {
   *   doc: DocumentHandle
   * }
   *
   * function SyncIndicator({doc}: SyncIndicatorProps) {
   *   const isSynced = useDocumentSyncStatus(doc)
   *
   *   return (
   *     <div className={`sync-status ${isSynced ? 'synced' : 'pending'}`}>
   *       {isSynced ? '✓ Synced' : 'Saving changes...'}
   *     </div>
   *   )
   * }
   *
   * // Usage:
   * // const doc = createDocumentHandle({ documentId: 'doc1', documentType: 'myType' })
   * // <SyncIndicator doc={doc} />
   * ```
   */
  (doc: {
    documentId: string
    documentType: string

    projectId?: string
    dataset?: string
    source?: DocumentSource
  }): boolean
}

/**
 * @public
 */
export const useDocumentSyncStatus: UseDocumentSyncStatus = ({
  projectId,
  dataset,
  source,
  ...options
}) => {
  const [instance, actualSource] = useSanityInstanceAndSource({projectId, dataset, source})
  const state = useMemo(
    () => getDocumentSyncStatus(instance, {...options, source: actualSource}),
    [actualSource, instance, options],
  )

  return useStoreState(state)
}
