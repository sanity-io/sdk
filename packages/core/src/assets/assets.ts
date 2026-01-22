import {
  type AssetMetadataType,
  type SanityAssetDocument,
  type SanityImageAssetDocument,
  type UploadBody,
} from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'
import {type SanityDocument} from '@sanity/types'

// rxjs no longer used in this module after refactor
import {getClient} from '../client/clientStore'
import {type DatasetHandle, type DocumentHandle} from '../config/sanityConfig'
import {getQueryState, resolveQuery} from '../query/queryStore'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'

const API_VERSION = 'v2025-10-29'
const IMAGE_ASSET_ID_PATTERN =
  /^image-(?<assetName>[A-Za-z0-9_-]+)-(?<dimensions>\d+x\d+)-(?<format>[a-z]+)$/

/**
 * Template-literal type for Sanity image asset IDs, eg:
 * `image-<hash>-<width>x<height>-<format>`
 * @public
 */
export type ImageAssetId<TFormat extends string = string> =
  `image-${string}-${number}x${number}-${Lowercase<TFormat>}`

/**
 * Runtime validator and type guard for image asset IDs
 * @public
 */
export function isImageAssetId(value: string): value is ImageAssetId {
  return IMAGE_ASSET_ID_PATTERN.test(value)
}

/**
 * Supported asset kinds for uploads
 * @public
 */
export type AssetKind = 'image' | 'file'

/**
 * Type guard to check if a document type is an asset document type
 * @public
 *
 * @param documentType - The document type to check
 * @returns True if the document type is 'sanity.imageAsset' or 'sanity.fileAsset'
 *
 * @example
 * ```ts
 * if (isAssetDocumentType(doc.documentType)) {
 *   // TypeScript knows this is an asset
 *   await deleteAsset(instance, doc)
 * }
 * ```
 */
export function isAssetDocumentType(
  documentType: string,
): documentType is 'sanity.imageAsset' | 'sanity.fileAsset' {
  return documentType === 'sanity.imageAsset' || documentType === 'sanity.fileAsset'
}

/**
 * Options when uploading an asset
 *
 * These map to the underlying Sanity Assets API. Most fields are optional and will be
 * stored on the created asset document.
 *
 * @public
 */
export interface UploadAssetOptions {
  /** Optional filename to associate with the uploaded asset */
  filename?: string
  /** Optional MIME type if it cannot be inferred */
  contentType?: string
  /** Optional title for the asset */
  title?: string
  /** Optional description for the asset */
  description?: string
  /** Optional freeform label */
  label?: string
  /** Optional credit line */
  creditLine?: string
  /** Optional metadata keys to extract on upload (mapped to client `extract`) */
  meta?: AssetMetadataType[]
  /** Name of the external source the asset originates from */
  sourceName?: string
  /** Identifier of the asset in the external source */
  sourceId?: string
  /** URL of the asset in the external source */
  sourceUrl?: string
  /** Optional explicit project to upload the asset to */
  projectId?: string
  /** Optional explicit dataset to upload the asset to */
  dataset?: string
}

/**
 * Upload an asset to the current project/dataset.
 *
 * - Pass `kind` as `'image'` or `'file'`.
 * - `body` accepts the common upload types (eg. `File`, `Blob`, `Buffer`, `NodeJS.ReadableStream`).
 * - Returns the created asset document.
 *
 * Example (browser):
 * ```ts
 * const file = input.files?.[0]!
 * const image = await uploadAsset(instance, 'image', file, {filename: file.name})
 * ```
 *
 * Example (node):
 * ```ts
 * import {createReadStream} from 'node:fs'
 *
 * const rs = createReadStream('/path/photo.jpg')
 * const image = await uploadAsset(instance, 'image', rs, {filename: 'photo.jpg'})
 * ```
 *
 * @public
 */
export async function uploadAsset(
  instance: SanityInstance,
  kind: 'image',
  body: UploadBody,
  options?: UploadAssetOptions,
): Promise<SanityImageAssetDocument>
/** @public */
export async function uploadAsset(
  instance: SanityInstance,
  kind: 'file',
  body: UploadBody,
  options?: UploadAssetOptions,
): Promise<SanityAssetDocument>
/** @public */
export async function uploadAsset(
  instance: SanityInstance,
  kind: AssetKind,
  body: UploadBody,
  options?: UploadAssetOptions,
): Promise<SanityAssetDocument | SanityImageAssetDocument> {
  const client = getClient(instance, {
    apiVersion: API_VERSION,
    projectId: options?.projectId ?? instance.config.projectId,
    dataset: options?.dataset ?? instance.config.dataset,
    useProjectHostname: true,
  })
  // Map public options to client upload options
  const clientOptions = {
    filename: options?.filename,
    contentType: options?.contentType,
    // `meta` maps to client `extract`
    ...(options?.meta ? {extract: options.meta} : {}),
    title: options?.title,
    description: options?.description,
    label: options?.label,
    creditLine: options?.creditLine,
    tag: 'sdk.upload-asset',
    ...(options?.sourceName && options?.sourceId
      ? {
          source: {
            name: options.sourceName,
            id: options.sourceId,
            ...(options?.sourceUrl ? {url: options.sourceUrl} : {}),
          },
        }
      : {}),
  }
  const assetType: 'image' | 'file' = kind
  return await client.assets.upload(assetType, body, clientOptions)
}

/**
 * Delete an asset document by its handle.
 *
 * This function accepts a document handle for an asset document (sanity.imageAsset or sanity.fileAsset).
 * It validates that the handle references an asset document type before deletion.
 *
 * @public
 *
 * @param instance - The Sanity instance
 * @param handle - Document handle for the asset to delete
 * @throws Error If the document handle doesn't reference an asset document type
 *
 * @example
 * ```ts
 * await deleteAsset(instance, {
 *   documentId: 'image-abc123-2000x1200-jpg',
 *   documentType: 'sanity.imageAsset',
 *   dataset: 'production'
 * })
 * ```
 */
export async function deleteAsset(
  instance: SanityInstance,
  handle: DocumentHandle<'sanity.imageAsset' | 'sanity.fileAsset'>,
): Promise<void> {
  // Validate that this is actually an asset document
  if (
    !handle.documentType ||
    !['sanity.imageAsset', 'sanity.fileAsset'].includes(handle.documentType)
  ) {
    throw new Error(
      `deleteAsset requires a document handle with documentType 'sanity.imageAsset' or 'sanity.fileAsset'. Got: ${handle.documentType}`,
    )
  }

  const projectId = handle.projectId ?? instance.config.projectId
  const dataset = handle.dataset ?? instance.config.dataset
  if (!projectId || !dataset) {
    throw new Error('A projectId and dataset are required to delete an asset.')
  }

  const client = getClient(instance, {
    apiVersion: API_VERSION,
    projectId,
    dataset,
    useProjectHostname: true,
  })
  await client.delete(handle.documentId)
}

/**
 * Append a download query parameter to an asset URL so that browsers download the file
 * using a preferred filename.
 *
 * If `filename` is omitted, the CDN uses the original filename (or the asset ID if absent).
 *
 * @public
 */
export function getAssetDownloadUrl(url: string, filename?: string): string {
  const param = typeof filename === 'string' && filename.length > 0 ? filename : ''
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}dl=${encodeURIComponent(param)}`
}

/**
 * Returns a configured `@sanity/image-url` builder bound to the instance's project/dataset
 * (or explicit overrides), for generating image URLs with transformations.
 *
 * @public
 */
export function getImageUrlBuilder(
  instance: SanityInstance,
  projectId?: string,
  dataset?: string,
): ReturnType<typeof imageUrlBuilder> {
  const resolvedProject = projectId ?? instance.config.projectId
  const resolvedDataset = dataset ?? instance.config.dataset
  if (!resolvedProject || !resolvedDataset) {
    throw new Error('A projectId and dataset are required to build image URLs.')
  }
  return imageUrlBuilder({projectId: resolvedProject, dataset: resolvedDataset})
}

/**
 * Asset document subset returned by default asset queries.
 *
 * Note: Asset documents (`sanity.imageAsset` and `sanity.fileAsset`) are regular Sanity documents
 * that live in datasets and can be queried, subscribed to, and manipulated like any other document.
 * This interface represents a minimal projection of asset document fields.
 *
 * @public
 *
 * @remarks
 * For full document operations, use the standard document APIs (e.g., `useDocument`, `getDocumentState`)
 * with document handles. The asset-specific APIs (`deleteAsset`, `uploadAsset`, `linkMediaLibraryAsset`)
 * provide convenience methods for common asset operations.
 */
export interface AssetDocumentBase {
  _id: string
  _type: 'sanity.imageAsset' | 'sanity.fileAsset'
  url?: string
  path?: string
  originalFilename?: string
  size?: number
  metadata?: unknown
}

/**
 * Options for querying assets
 * @public
 */
export interface AssetQueryOptions<
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId> {
  /** Restrict to a specific asset type. Defaults to both */
  assetType?: 'image' | 'file' | 'all'
  /** Additional GROQ filter expression appended with && (...) */
  where?: string
  /** GROQ params */
  params?: Record<string, unknown>
  /** Optional ordering, eg: `_createdAt desc` */
  order?: string
  /** Limit number of results */
  limit?: number
  /** Optional projection body inside \{...\}. Omit to return full documents */
  projection?: string
}

function buildAssetsGroq(
  options: Omit<AssetQueryOptions, 'projectId' | 'dataset' | 'params'>,
): string {
  const typeNames =
    options.assetType === 'image'
      ? ['sanity.imageAsset']
      : options.assetType === 'file'
        ? ['sanity.fileAsset']
        : ['sanity.imageAsset', 'sanity.fileAsset']

  const typeFilter = `_type in [${typeNames.map((t) => `"${t}"`).join(', ')}]`
  const where = options.where ? `${typeFilter} && (${options.where})` : typeFilter

  let groq = `*[${where}]`
  if (options.order) groq += ` | order(${options.order})`
  if (typeof options.limit === 'number') groq += `[0...${options.limit}]`
  if (options.projection) groq += `{${options.projection}}`
  return groq
}

/**
 * Returns a StateSource for an asset query using the centralized query store.
 *
 * @public
 *
 * @remarks
 * This is a convenience wrapper around `getQueryState` for querying asset documents.
 * Asset documents (`sanity.imageAsset` and `sanity.fileAsset`) are regular documents,
 * so you can also use `getQueryState` directly with custom GROQ queries for more control.
 *
 * @example Basic usage
 * ```ts
 * const state = getAssetsState(instance, {
 *   assetType: 'image',
 *   limit: 50
 * })
 * state.subscribe(images => {
 *   // render images
 * })
 * ```
 *
 * @example Equivalent using getQueryState
 * ```ts
 * const state = getQueryState(instance, {
 *   query: '*[_type == "sanity.imageAsset"][0...50]'
 * })
 * ```
 */
export function getAssetsState(
  instance: SanityInstance,
  options: AssetQueryOptions,
): StateSource<AssetDocumentBase[] | undefined> {
  const projectId = options.projectId ?? instance.config.projectId
  const dataset = options.dataset ?? instance.config.dataset
  if (!projectId || !dataset) {
    throw new Error('A projectId and dataset are required to query assets.')
  }

  const groq = buildAssetsGroq(options)
  return getQueryState<AssetDocumentBase[]>(instance, {
    query: groq,
    params: options.params,
    projectId,
    dataset,
    tag: 'sdk.assets',
  })
}

/**
 * Resolves an asset query one-time (Promise-based).
 *
 * @public
 *
 * @remarks
 * This is a convenience wrapper around `resolveQuery` for querying asset documents.
 * Asset documents (`sanity.imageAsset` and `sanity.fileAsset`) are regular documents,
 * so you can also use `resolveQuery` directly with custom GROQ queries for more control.
 *
 * @example Basic usage
 * ```ts
 * const files = await resolveAssets(instance, {
 *   assetType: 'file',
 *   order: '_createdAt desc'
 * })
 * ```
 *
 * @example Equivalent using resolveQuery
 * ```ts
 * const files = await resolveQuery(instance, {
 *   query: '*[_type == "sanity.fileAsset"] | order(_createdAt desc)'
 * })
 * ```
 */
export function resolveAssets(
  instance: SanityInstance,
  options: AssetQueryOptions,
): Promise<AssetDocumentBase[]> {
  const projectId = options.projectId ?? instance.config.projectId
  const dataset = options.dataset ?? instance.config.dataset
  if (!projectId || !dataset) {
    throw new Error('A projectId and dataset are required to query assets.')
  }

  const groq = buildAssetsGroq(options)
  return resolveQuery<AssetDocumentBase[]>(instance, {
    query: groq,
    params: options.params,
    projectId,
    dataset,
    tag: 'sdk.assets',
  })
}

/**
 * Options for linking a Media Library asset to a dataset
 * @public
 */
export interface LinkMediaLibraryAssetOptions<
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId> {
  assetId: string
  mediaLibraryId: string
  assetInstanceId: string
  /** Optional request tag */
  tag?: string
}

/**
 * Link a Media Library asset to a local dataset, creating a linked asset document.
 *
 * Example:
 * ```ts
 * await linkMediaLibraryAsset(instance, {
 *   assetId: 'mlAssetId',
 *   mediaLibraryId: 'mediaLib1',
 *   assetInstanceId: 'mlInst1',
 * })
 * ```
 *
 * @public
 */
export async function linkMediaLibraryAsset(
  instance: SanityInstance,
  options: LinkMediaLibraryAssetOptions,
): Promise<SanityDocument> {
  const projectId = options.projectId ?? instance.config.projectId
  const dataset = options.dataset ?? instance.config.dataset
  if (!projectId || !dataset) {
    throw new Error('A projectId and dataset are required to link a Media Library asset.')
  }

  const client = getClient(instance, {
    apiVersion: API_VERSION,
    projectId,
    dataset,
    useProjectHostname: true,
  })
  return await client.request<SanityDocument>({
    uri: `/assets/media-library-link/${dataset}`,
    method: 'POST',
    tag: options.tag ?? 'sdk.link-media-library',
    body: {
      assetId: options.assetId,
      mediaLibraryId: options.mediaLibraryId,
      assetInstanceId: options.assetInstanceId,
    },
  })
}
