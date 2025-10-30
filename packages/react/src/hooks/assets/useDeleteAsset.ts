import {deleteAsset} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * @public
 * Provides a stable callback to delete an asset by its asset document ID.
 *
 * Example:
 * ```tsx
 * const remove = useDeleteAsset()
 * await remove('image-abc123-2000x1200-jpg')
 * ```
 */
export const useDeleteAsset = createCallbackHook(deleteAsset)
