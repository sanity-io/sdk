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
import {type AssetHandle, type DatasetHandle} from '../config/sanityConfig'
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
 * Delete an asset by its asset document ID.
 * Pass the asset document `_id` (eg. `image-abc123-2000x1200-jpg`).
 * @public
 */
export async function deleteAsset(instance: SanityInstance, assetDocumentId: string): Promise<void>
/** @public */
export async function deleteAsset(instance: SanityInstance, handle: AssetHandle): Promise<void>
/** @public */
export async function deleteAsset(
  instance: SanityInstance,
  idOrHandle: string | AssetHandle,
): Promise<void> {
  if (typeof idOrHandle === 'string') {
    const client = getClient(instance, {apiVersion: API_VERSION})
    await client.delete(idOrHandle)
    return
  }

  const projectId = idOrHandle.projectId ?? instance.config.projectId
  const dataset = idOrHandle.dataset ?? instance.config.dataset
  if (!projectId || !dataset) {
    throw new Error('A projectId and dataset are required to delete an asset.')
  }
  const client = getClient(instance, {
    apiVersion: API_VERSION,
    projectId,
    dataset,
    useProjectHostname: true,
  })
  await client.delete(idOrHandle.assetId)
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
 * Asset document subset returned by default asset queries
 * @public
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
 * Returns a StateSource for an asset query.
 *
 * Example:
 * ```ts
 * const state = getAssetsState(instance, {assetType: 'image', limit: 50})
 * state.subscribe(images => {
 *   // render
 * })
 * ```
 *
 * @public
 */
// kept for backward-compat in docs (exported above as function)
/**
 * Resolves an asset query one-time (Promise-based).
 *
 * Example:
 * ```ts
 * const files = await resolveAssets(instance, {assetType: 'file', order: '_createdAt desc'})
 * ```
 *
 * @public
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
