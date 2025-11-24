import {linkMediaLibraryAsset, type LinkMediaLibraryAssetOptions} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * @public
 * Provides a stable callback to link a Media Library asset to your dataset.
 *
 * Example:
 * ```tsx
 * const linkMlAsset = useLinkMediaLibraryAsset()
 * await linkMlAsset({
 *   assetId: 'mlAssetId',
 *   mediaLibraryId: 'mediaLib1',
 *   assetInstanceId: 'mlInst1',
 * })
 * ```
 */
export const useLinkMediaLibraryAsset = createCallbackHook(
  (instance, options: LinkMediaLibraryAssetOptions) => linkMediaLibraryAsset(instance, options),
)
