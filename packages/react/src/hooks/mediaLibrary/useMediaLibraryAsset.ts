import {type DocumentHandle, type ResourceHandle} from '../../config/handles'
import {useDocument} from '../document/useDocument'

/**
 * Identifies a media library asset by its asset document ID.
 *
 * Accepts the same resource options as other handles (`resourceName`, or a
 * `projectId`/`dataset` pair), so the asset can be read from a specific
 * resource or from the nearest instance in context.
 *
 * @public
 */
export interface MediaLibraryAssetHandle<
  TDataset extends string = string,
  TProjectId extends string = string,
> extends ResourceHandle<TDataset, TProjectId> {
  /** The `_id` of the asset document (e.g. `image-abc123-2000x3000-jpg`) */
  assetId: string
  /** The kind of asset the ID refers to. Defaults to `'image'`. */
  assetType?: 'image' | 'file'
}

/**
 * The subset of asset document fields most consumers need. Pass your own type
 * parameter to {@link useMediaLibraryAsset} to widen or narrow this.
 *
 * @public
 */
export interface MediaLibraryAsset {
  /** The asset document `_id` */
  _id: string
  /** The asset document type (`sanity.imageAsset` or `sanity.fileAsset`) */
  _type: string
  /** The CDN URL the asset is served from */
  url?: string
  /** The filename the asset was uploaded with */
  originalFilename?: string
  /** The asset's MIME type (e.g. `image/jpeg`) */
  mimeType?: string
  /** The asset's size in bytes */
  size?: number
}

/**
 * Builds the `DocumentHandle` for a media library asset document.
 *
 * Useful when you want to feed an asset into other document-based hooks
 * (e.g. `useDocumentProjection`) rather than reading the full asset document.
 *
 * @category Documents
 * @param options - The asset handle (`assetId`, optional `assetType` and resource options)
 * @returns A `DocumentHandle` addressing the asset document.
 *
 * @public
 */
export function getMediaLibraryAssetDocumentHandle<
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: MediaLibraryAssetHandle<TDataset, TProjectId>,
): DocumentHandle<string, TDataset, TProjectId> {
  const {assetId, assetType = 'image', ...resource} = options
  return {
    ...resource,
    documentId: assetId,
    documentType: assetType === 'file' ? 'sanity.fileAsset' : 'sanity.imageAsset',
  }
}

/**
 * Reads a media library asset document by its asset ID.
 *
 * This is a convenience wrapper around {@link useDocument}: it builds the
 * asset's document handle for you (via
 * {@link getMediaLibraryAssetDocumentHandle}) so you don't have to know the
 * asset document type. Like `useDocument`, it suspends while the asset is
 * being fetched.
 *
 * @category Documents
 * @param options - The asset handle (`assetId`, optional `assetType` and resource options)
 * @returns The asset document, or `null` if it doesn't exist.
 *
 * @example Render an image asset's URL and filename
 * ```tsx
 * import {useMediaLibraryAsset} from '@sanity/sdk-react'
 *
 * function AssetPreview({assetId}: {assetId: string}) {
 *   const {data: asset} = useMediaLibraryAsset({assetId})
 *
 *   if (!asset) return null
 *   return <img src={asset.url} alt={asset.originalFilename} />
 * }
 * ```
 *
 * @public
 * @function
 */
export function useMediaLibraryAsset<TData = MediaLibraryAsset>(
  options: MediaLibraryAssetHandle,
): {data: TData | null} {
  return useDocument<TData>(getMediaLibraryAssetDocumentHandle(options))
}
