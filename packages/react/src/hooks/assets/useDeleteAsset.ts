import {deleteAsset, type DocumentHandle} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * @public
 * Provides a stable callback to delete an asset document.
 *
 * This hook accepts a document handle for an asset document (sanity.imageAsset or sanity.fileAsset).
 * It validates that the handle references an asset document type before deletion.
 *
 * @example
 * ```tsx
 * const remove = useDeleteAsset()
 *
 * // Delete an image asset
 * await remove({
 *   documentId: 'image-abc123-2000x1200-jpg',
 *   documentType: 'sanity.imageAsset'
 * })
 *
 * // Delete a file asset from a specific dataset
 * await remove({
 *   documentId: 'file-xyz789-pdf',
 *   documentType: 'sanity.fileAsset',
 *   dataset: 'production'
 * })
 * ```
 */
export const useDeleteAsset = createCallbackHook(
  (instance, handle: DocumentHandle<'sanity.imageAsset' | 'sanity.fileAsset'>) =>
    deleteAsset(instance, handle),
)
