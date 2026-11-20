import {
  DocumentId,
  getDraftId,
  getPublishedId,
  getVersionId,
  isDraftId,
  isVersionId,
} from '@sanity/id-utils'

import {type DocumentHandle, type DocumentResource} from '../config/sanityConfig'
import {getEffectiveDocumentModel} from '../document/resourceRules'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type DocumentHistoryOptions, type DocumentVariantType} from './types'

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
  const docId = DocumentId(handle.documentId)
  if (isVersionId(docId)) {
    return handle.documentId
  }

  const model = getEffectiveDocumentModel(resource, handle.documentType)
  if ((model.liveEdit ?? handle.liveEdit) === true) {
    return getPublishedId(docId)
  }

  if (model.supportsReleases && isReleasePerspective(handle.perspective)) {
    return getVersionId(docId, handle.perspective.releaseName)
  }

  if (handle.perspective === 'published') {
    return getPublishedId(docId)
  }

  return getDraftId(docId)
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
 * Serializes `DocumentHistoryOptions` into a deterministic string key so React hooks can
 * memoize and defer option changes without bundling `historyStore` into unrelated entry points.
 *
 * @internal
 */
export function getDocumentHistoryOptionsKey(options: DocumentHistoryOptions): string {
  return JSON.stringify({
    documentId: options.documentId,
    documentType: options.documentType,
    projectId: options.projectId,
    dataset: options.dataset,
    resource: options.resource,
    perspective: options.perspective,
    liveEdit: options.liveEdit,
    limit: options.limit,
    includeEditEvents: options.includeEditEvents,
  } satisfies DocumentHistoryOptions & Record<keyof DocumentHistoryOptions, unknown>)
}

/**
 * Reconstructs `DocumentHistoryOptions` from a key produced by
 * {@link getDocumentHistoryOptionsKey}.
 *
 * @internal
 */
export function parseDocumentHistoryOptionsKey(key: string): DocumentHistoryOptions {
  return JSON.parse(key) as DocumentHistoryOptions
}
