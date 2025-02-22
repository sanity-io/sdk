import {type DocumentHandle, getDocumentSyncStatus} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

type UseDocumentSyncStatus = {
  /**
   * Exposes the document’s sync status between local and remote document states.
   * @param doc - The document handle to get sync status for
   * @returns `true` if local changes are synced with remote, `false` if the changes are not synced, and `undefined` if the document is not found
   * @example Disable a Save button when there are no changes to sync
   * ```
   * const myDocumentHandle = { _id: 'documentId', _type: 'documentType' }
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
