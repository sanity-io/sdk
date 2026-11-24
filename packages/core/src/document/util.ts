import {DocumentId, getPublishedId, getVersionId} from '@sanity/id-utils'

import {type DocumentHandle} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'

export function getEffectiveDocumentId(doc: DocumentHandle): string {
  if (doc.liveEdit) {
    return doc.documentId
  } else if (isReleasePerspective(doc.perspective)) {
    return getVersionId(DocumentId(doc.documentId), doc.perspective.releaseName)
  } else {
    return getPublishedId(DocumentId(doc.documentId))
  }
}
