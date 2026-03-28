import {
  type DocumentHandle as StrictDocumentHandle,
  getDocumentSyncStatus,
  resolveDocument,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'

import {type DocumentHandle} from '../../config/handles'
import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'

type UseDocumentSyncStatus = {
  /**
   * Exposes the document's sync status between local and remote document states.
   *
   * @category Documents
   * @param doc - The document handle to get sync status for. If you pass a `resource` in the handle,
   * the document will be read from the specified resource. If no `resource` is provided,
   * the resource will be resolved from context.
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
  (doc: DocumentHandle): boolean
}

const useDocumentSyncStatusValue = createStateSourceHook({
  getState: getDocumentSyncStatus as (
    instance: SanityInstance,
    doc: StrictDocumentHandle,
  ) => StateSource<boolean>,
  shouldSuspend: (instance, doc: StrictDocumentHandle) =>
    getDocumentSyncStatus(instance, doc).getCurrent() === undefined,
  suspender: (instance, doc: StrictDocumentHandle) => resolveDocument(instance, doc),
})

/**
 * @public
 * @function
 */
export const useDocumentSyncStatus: UseDocumentSyncStatus = (options: DocumentHandle) => {
  const normalizedOptions = useNormalizedResourceOptions(options)
  return useDocumentSyncStatusValue(normalizedOptions)
}
