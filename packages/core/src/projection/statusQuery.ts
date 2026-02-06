import {
  DocumentId,
  getDraftId,
  getPublishedId,
  getVersionId,
  isDraftId,
  isPublishedId,
  isVersionId,
} from '@sanity/id-utils'

import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type BoundPerspectiveKey} from '../store/createActionBinder'
import {type ProjectionStoreState} from './types'

interface StatusQueryResult {
  _id: string
  _updatedAt: string
}

/**
 * Builds an array of document IDs to query for status information using the "raw" perspective.
 * Includes draft, published, and version IDs as needed.
 */
export function buildStatusQueryIds(
  documentIds: Set<string>,
  perspective: BoundPerspectiveKey['perspective'],
): string[] {
  const ids: string[] = []
  const releaseName = isReleasePerspective(perspective) ? perspective.releaseName : null

  for (const id of documentIds) {
    const publishedId = getPublishedId(DocumentId(id))
    const draftId = getDraftId(publishedId)

    // Always query for draft and published versions
    ids.push(draftId, publishedId)

    // If it's a release perspective, also query for the version
    if (releaseName) {
      ids.push(getVersionId(publishedId, releaseName))
    }
  }

  return ids
}

/**
 * Processes status query results into documentStatuses (same shape as _status returned to users).
 */
export function processStatusQueryResults(
  results: StatusQueryResult[],
): ProjectionStoreState['documentStatuses'] {
  const documentStatuses: ProjectionStoreState['documentStatuses'] = {}

  for (const result of results) {
    const id = DocumentId(result._id)
    const updatedAt = result._updatedAt
    const publishedId = getPublishedId(id)
    const statusData = documentStatuses[publishedId] ?? {}
    if (isDraftId(id)) {
      statusData.lastEditedDraftAt = updatedAt
    } else if (isVersionId(id)) {
      statusData.lastEditedVersionAt = updatedAt
    } else if (isPublishedId(id)) {
      statusData.lastEditedPublishedAt = updatedAt
    }
    documentStatuses[publishedId] = statusData
  }

  return documentStatuses
}
