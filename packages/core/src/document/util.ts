import {DocumentId, getPublishedId, getVersionId, isVersionId} from '@sanity/id-utils'

import {type DocumentHandle, type PerspectiveHandle} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'

interface DocumentHandleLike {
  liveEdit?: boolean
  perspective?: PerspectiveHandle['perspective']
  documentId?: string
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

export function shouldHaveSingleDocument(doc: DocumentHandleLike): boolean {
  return (
    doc.liveEdit ||
    isReleasePerspective(doc.perspective) ||
    isVersionId(DocumentId(doc.documentId ?? ''))
  )
}
