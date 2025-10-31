import {
  type AssetDocumentBase,
  type AssetQueryOptions,
  getAssetsState,
  resolveAssets,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'
import {identity} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

type UseAssets = (options?: AssetQueryOptions) => AssetDocumentBase[]

/**
 * @public
 * Returns assets from your dataset based on flexible query options.
 *
 * Examples:
 * ```tsx
 * // Images only
 * const images = useAssets({assetType: 'image', limit: 50})
 *
 * // Files ordered by creation
 * const files = useAssets({assetType: 'file', order: '_createdAt desc'})
 *
 * // Filter (GROQ) with params
 * const results = useAssets({where: 'size > $min', params: {min: 1024}})
 * ```
 */
export const useAssets: UseAssets = createStateSourceHook({
  getState: (instance: SanityInstance, options?: AssetQueryOptions) =>
    getAssetsState(instance, (options ?? {}) as AssetQueryOptions) as unknown as StateSource<
      AssetDocumentBase[]
    >,
  shouldSuspend: (instance: SanityInstance, options?: AssetQueryOptions) =>
    getAssetsState(instance, (options ?? {}) as AssetQueryOptions).getCurrent() === undefined,
  suspender: (instance: SanityInstance, options?: AssetQueryOptions) =>
    resolveAssets(instance, (options ?? {}) as AssetQueryOptions),
  getConfig: identity as (options?: AssetQueryOptions) => AssetQueryOptions | undefined,
})
