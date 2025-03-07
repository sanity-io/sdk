import {type DocumentHandle, getDocumentSyncStatus} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

type UseDocumentSyncStatus = {
  /**
   * Exposes the document’s sync status between local and remote document states.
   *
   * @category Documents
   * @param doc - The document handle to get sync status for. If you pass a `DocumentHandle` with a `resourceId` (in the format of `document:projectId.dataset:documentId`)
   * the document will be read from the specified Sanity project and dataset that is included in the handle. If no `resourceId` is provided, the default project and dataset from your `SanityApp` configuration will be used.
   * @returns `true` if local changes are synced with remote, `false` if the changes are not synced, and `undefined` if the document is not found
   * @example Disable a Save button when there are no changes to sync
   * ```
   * const myDocumentHandle = { _id: 'documentId', _type: 'documentType', resourceId: 'document:projectId:dataset:documentId' }
   * const documentSynced = useDocumentSyncStatus(myDocumentHandle)
   *
   * return (
   *   <button disabled={documentSynced}>
   *     Save Changes
   *   </button>
   * )
   * ```
   */
  (doc: DocumentHandle): boolean | undefined
}

/** @beta */
export const useDocumentSyncStatus: UseDocumentSyncStatus =
  createStateSourceHook(getDocumentSyncStatus)
