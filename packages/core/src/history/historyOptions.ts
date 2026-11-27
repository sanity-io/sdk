import {DocumentId, isDraftId, isVersionId} from '@sanity/id-utils'

import {
  type DatasetHandle,
  type DocumentHandle,
  type DocumentResource,
  isCanvasResource,
  isDatasetResource,
  isMediaLibraryResource,
} from '../config/sanityConfig'
import {getDocumentVariantId} from '../document/getDocumentVariantId'
import {type SanityInstance} from '../store/createSanityInstance'
import {isDeepEqual} from '../utils/object'
import {type DocumentsHistoryOptions, type DocumentVariantType} from './types'

/**
 * Maximum number of distinct document variants supported in a single history events request.
 *
 * @internal
 */
export const MAX_HISTORY_DOCUMENTS = 100

/**
 * Default page size for the History Events API.
 *
 * @internal
 */
export const DEFAULT_HISTORY_LIMIT = 100

/**
 * Normalized request parameters for reading history across one or more document variants.
 *
 * @internal
 */
export interface ResolvedDocumentsHistoryRequest {
  resource: DocumentResource
  variantIds: string[]
  limit: number
}

/**
 * Resolves a document handle and resource to the exact Content Lake document variant ID
 * (`<id>`, `drafts.<id>`, or `versions.<release>.<id>`) whose history timeline should be read.
 *
 * @internal
 */
export function resolveHistoryDocumentId(
  handle: Pick<DocumentHandle, 'documentId' | 'documentType' | 'liveEdit' | 'perspective'>,
  resource?: DocumentResource,
): string {
  if (isVersionId(DocumentId(handle.documentId))) {
    return handle.documentId
  }

  return getDocumentVariantId(handle, resource)
}

/**
 * Classifies a Content Lake document ID into `'draft'`, `'published'`, or `'version'`.
 *
 * @internal
 */
export function getDocumentVariantType(variantId: string): DocumentVariantType {
  const docId = DocumentId(variantId)
  if (isVersionId(docId)) return 'version'
  if (isDraftId(docId)) return 'draft'
  return 'published'
}

/**
 * Resolves the effective {@link DocumentResource} for a history read from explicit options
 * (`resource` or `projectId`/`dataset`) or the `SanityInstance` config.
 *
 * @internal
 */
export function resolveHistoryResource(
  instance: SanityInstance,
  options?: DatasetHandle,
): DocumentResource {
  if (options?.resource) return options.resource
  if (options?.projectId && options?.dataset) {
    return {projectId: options.projectId, dataset: options.dataset}
  }
  if (instance.config.resource) return instance.config.resource
  if (instance.config.projectId && instance.config.dataset) {
    return {projectId: instance.config.projectId, dataset: instance.config.dataset}
  }
  throw new Error('This API requires a project ID and dataset configured.')
}

/**
 * Serializes a {@link DocumentResource} into a deterministic cache key prefix.
 *
 * @internal
 */
export function getHistoryResourceKey(resource: DocumentResource): string {
  if (isDatasetResource(resource)) return `${resource.projectId}.${resource.dataset}`
  if (isMediaLibraryResource(resource)) return `media-library:${resource.mediaLibraryId}`
  if (isCanvasResource(resource)) return `canvas:${resource.canvasId}`
  throw new Error(`Received invalid resource: ${JSON.stringify(resource)}`)
}

/**
 * Validates and resolves {@link DocumentsHistoryOptions} into a single shared resource,
 * canonical deduplicated/sorted `variantIds`, and page `limit`.
 *
 * Returns `null` when `options.documents` is empty so callers can short-circuit without
 * touching `historyStore` or `clientStore`.
 *
 * @internal
 */
export function resolveDocumentsHistoryRequest(
  instance: SanityInstance,
  options: DocumentsHistoryOptions,
): ResolvedDocumentsHistoryRequest | null {
  if (options.documents.length === 0) {
    return null
  }

  let sharedResource: DocumentResource | undefined
  const variantSet = new Set<string>()

  for (const handle of options.documents) {
    const handleResource = resolveHistoryResource(instance, handle)
    if (!sharedResource) {
      sharedResource = handleResource
    } else if (!isDeepEqual(handleResource, sharedResource)) {
      throw new Error(
        `Mismatched resources found in documents. All documents must belong to the same resource. Found "${JSON.stringify(handleResource)}" but expected "${JSON.stringify(sharedResource)}".`,
      )
    }

    variantSet.add(
      resolveHistoryDocumentId(
        {...handle, perspective: handle.perspective ?? instance.config.perspective},
        sharedResource,
      ),
    )
  }

  const variantIds = Array.from(variantSet).sort()
  if (variantIds.length > MAX_HISTORY_DOCUMENTS) {
    throw new Error(
      `Cannot read history for more than ${MAX_HISTORY_DOCUMENTS} documents at once (received ${variantIds.length}).`,
    )
  }

  return {
    resource: sharedResource!,
    variantIds,
    limit: options.limit ?? DEFAULT_HISTORY_LIMIT,
  }
}

function serializeDocumentHandle(handle: DocumentHandle): string {
  return JSON.stringify({
    documentId: handle.documentId,
    documentType: handle.documentType,
    projectId: handle.projectId,
    dataset: handle.dataset,
    resource: handle.resource,
    perspective: handle.perspective,
    liveEdit: handle.liveEdit,
  } satisfies DocumentHandle & Record<keyof DocumentHandle, unknown>)
}

/**
 * Serializes {@link DocumentsHistoryOptions} into a deterministic string key so React hooks can
 * memoize and defer option changes without bundling `historyStore` into unrelated entry points.
 *
 * Handles are canonicalized (deduplicated and sorted) so reordering the `documents` array or
 * constructing new object literals with identical values produces the same key.
 *
 * @internal
 */
export function getDocumentsHistoryOptionsKey(options: DocumentsHistoryOptions): string {
  const canonicalHandles = Array.from(new Set(options.documents.map(serializeDocumentHandle)))
    .sort()
    .map((serialized) => JSON.parse(serialized) as DocumentHandle)

  return JSON.stringify({
    documents: canonicalHandles,
    limit: options.limit,
  } satisfies DocumentsHistoryOptions & Record<keyof DocumentsHistoryOptions, unknown>)
}

/**
 * Reconstructs {@link DocumentsHistoryOptions} from a key produced by
 * {@link getDocumentsHistoryOptionsKey}.
 *
 * @internal
 */
export function parseDocumentsHistoryOptionsKey(key: string): DocumentsHistoryOptions {
  return JSON.parse(key) as DocumentsHistoryOptions
}
