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
  /**
   * Present on the variant status query only. Variant ids are opaque, so the
   * bundle a variant document belongs to is read from `_system` instead of
   * its id. Absent for the published bundle.
   */
  bundleId?: string | null
}

interface StatusQuery {
  query: string
  params: Record<string, unknown>
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
 * Builds the raw-perspective query that feeds `_status`.
 *
 * Without a variant the documents are named by id. With a variant, `_status`
 * describes the variant's documents instead; their ids can't be built
 * client-side, so the query selects them through `_system` and reports each
 * one's bundle so it can be classified. A variant pending creation has no
 * remote document and so contributes nothing, leaving its status empty.
 */
export function buildStatusQuery(
  documentIds: Set<string>,
  perspective: BoundPerspectiveKey['perspective'],
  variant: string | undefined,
): StatusQuery {
  if (variant === undefined) {
    return {
      query: `*[_id in $statusIds]{_id, _updatedAt}`,
      params: {statusIds: buildStatusQueryIds(documentIds, perspective)},
    }
  }
  return {
    query: `*[_system.variant._ref == $variantRef && _system.group._ref in $groupIds]{_id, _updatedAt, "bundleId": _system.bundleId}`,
    params: {
      variantRef: `_.variants.${variant}`,
      groupIds: [...documentIds].map((id) => getPublishedId(DocumentId(id))),
    },
  }
}

/**
 * Processes status query results into documentStatuses (same shape as _status returned to users).
 *
 * Results of a variant status query are classified by the bundle each carries
 * and grouped under their document group id, which is the last segment of
 * every version id. Otherwise results are classified by id prefix as before.
 */
export function processStatusQueryResults(
  results: StatusQueryResult[],
  perspective?: BoundPerspectiveKey['perspective'],
  variant?: string,
): ProjectionStoreState['documentStatuses'] {
  const documentStatuses: ProjectionStoreState['documentStatuses'] = {}
  const releaseName = isReleasePerspective(perspective) ? perspective.releaseName : undefined

  for (const result of results) {
    const id = DocumentId(result._id)
    const updatedAt = result._updatedAt
    const publishedId = getPublishedId(id)
    const statusData = documentStatuses[publishedId] ?? {}
    const bundle =
      variant === undefined ? classifyId(id) : classifyBundle(result.bundleId, releaseName)
    if (bundle === 'draft') statusData.lastEditedDraftAt = updatedAt
    else if (bundle === 'version') statusData.lastEditedVersionAt = updatedAt
    else if (bundle === 'published') statusData.lastEditedPublishedAt = updatedAt
    documentStatuses[publishedId] = statusData
  }

  return documentStatuses
}

type Bundle = 'draft' | 'version' | 'published' | undefined

function classifyId(id: DocumentId): Bundle {
  if (isDraftId(id)) return 'draft'
  if (isVersionId(id)) return 'version'
  if (isPublishedId(id)) return 'published'
  return undefined
}

function classifyBundle(
  bundleId: string | null | undefined,
  releaseName: string | undefined,
): Bundle {
  // GROQ projects a missing `_system.bundleId` as null; both mean published
  if (bundleId === undefined || bundleId === null) return 'published'
  if (bundleId === 'drafts') return 'draft'
  // a variant over some other release is not part of this perspective
  return bundleId === releaseName ? 'version' : undefined
}
