import {DocumentId, getDraftId, getPublishedId, getVersionId} from '@sanity/id-utils'

import {type DocumentHandle} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'

/**
 * The id of the specific document a user is editing under a given perspective:
 * the draft, the published document, or a release version.
 *
 * Distinct from {@link getEffectiveDocumentId}, which resolves the canonical key a
 * document's state is stored under and so collapses a draft onto its published id.
 * This one keeps them apart, because some things compare the exact id. Presence is
 * the motivating case: the Studio's field indicators match the id its form is on,
 * exactly, so an app reporting the published id shows up in the Studio at document
 * level while never lighting up a single field.
 *
 * @remarks
 * Resolved from the handle alone, which is right whenever a draft or version
 * exists, so for any document actually being edited. The Studio additionally falls
 * back to whichever document exists, so for a published document nobody has edited
 * yet its form sits on the published id where this returns the draft id. Matching
 * that would mean reading document state, which presence deliberately does not
 * depend on.
 *
 * @internal
 */
export function getEditingDocumentId(
  doc: Pick<DocumentHandle, 'documentId' | 'liveEdit' | 'perspective'>,
): string {
  if (doc.liveEdit) {
    return getPublishedId(DocumentId(doc.documentId))
  }
  if (isReleasePerspective(doc.perspective)) {
    return getVersionId(DocumentId(doc.documentId), doc.perspective.releaseName)
  }
  if (doc.perspective === 'published') {
    return getPublishedId(DocumentId(doc.documentId))
  }
  return getDraftId(DocumentId(doc.documentId))
}

export function getEffectiveDocumentId(doc: DocumentHandle): string {
  if (doc.liveEdit) {
    return doc.documentId
  } else if (isReleasePerspective(doc.perspective)) {
    return getVersionId(DocumentId(doc.documentId), doc.perspective.releaseName)
  } else {
    return getPublishedId(DocumentId(doc.documentId))
  }
}
