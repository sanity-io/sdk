import {DocumentId, getDraftId, getPublishedId, getVersionId} from '@sanity/id-utils'

import {type DocumentHandle, type DocumentResource} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {getEffectiveDocumentModel} from './resourceRules'

/**
 * Resolves a document handle (and optional resource) to the exact Content Lake
 * document variant ID (`<id>`, `drafts.<id>`, or `versions.<release>.<id>`).
 *
 * Distinct from {@link getEffectiveDocumentId}, which resolves the canonical key
 * a document's state is stored under and collapses a draft onto its published ID.
 * Use this helper whenever the exact variant ID matters—such as presence
 * locations (which must match Studio's exact document ID) or document history
 * queries.
 *
 * When a `resource` is supplied, resource-specific editing rules from
 * {@link getEffectiveDocumentModel} are applied (for example, Canvas forces
 * `liveEdit` and disables release perspectives, and Media Library uses drafts
 * only for `sanity.asset`).
 *
 * @internal
 */
export function getDocumentVariantId(
  handle: Pick<DocumentHandle, 'documentId' | 'liveEdit' | 'perspective'> &
    Partial<Pick<DocumentHandle, 'documentType'>>,
  resource?: DocumentResource,
): string {
  const docId = DocumentId(handle.documentId)
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
