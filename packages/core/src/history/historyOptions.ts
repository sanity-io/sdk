import {DocumentId, isDraftId, isVersionId} from '@sanity/id-utils'

import {type DocumentHandle, type DocumentResource} from '../config/sanityConfig'
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

function getInstanceFallbackResource(instance: SanityInstance): DocumentResource | undefined {
  if (instance.config.resource) return instance.config.resource
  if (instance.config.projectId && instance.config.dataset) {
    return {projectId: instance.config.projectId, dataset: instance.config.dataset}
  }
  return undefined
}

function resolveHandleResource(
  handle: DocumentHandle,
  fallbackResource: DocumentResource | undefined,
): DocumentResource {
  if (handle.resource) return handle.resource
  if (handle.projectId && handle.dataset) {
    return {projectId: handle.projectId, dataset: handle.dataset}
  }
  if (fallbackResource) return fallbackResource
  throw new Error('This API requires a project ID and dataset configured.')
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

  const fallbackResource = getInstanceFallbackResource(instance)
  let sharedResource: DocumentResource | undefined
  const variantSet = new Set<string>()

  for (const handle of options.documents) {
    const handleResource = resolveHandleResource(handle, fallbackResource)
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
