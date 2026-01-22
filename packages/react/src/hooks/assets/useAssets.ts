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
 * @remarks
 * This is a convenience hook for querying asset documents (`sanity.imageAsset` and `sanity.fileAsset`).
 * Asset documents are regular Sanity documents, so you can also use `useQuery` directly with
 * custom GROQ queries for more control.
 *
 * For working with individual asset documents (editing, subscribing to changes), use the standard
 * document hooks like `useDocument` with a document handle.
 *
 * @example Basic usage
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
 *
 * @example Equivalent using useQuery
 * ```tsx
 * import {useQuery} from '@sanity/sdk-react'
 *
 * // Same as useAssets({assetType: 'image', limit: 50})
 * const {data: images} = useQuery({
 *   query: '*[_type == "sanity.imageAsset"][0...50]'
 * })
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
