import {type DocumentId, getDraftId, getPublishedId, getVersionId} from '@sanity/id-utils'

import {type PerspectiveHandle} from '../config/sanityConfig'
import {
  type DocumentProjections,
  type DocumentProjectionValues,
  type ValidProjection,
} from './types'

export type ProjectionQueryResult = {
  _id: DocumentId
  _type: string
  _updatedAt: string
  result: Record<string, unknown>
  __projectionHash: string
}

interface CreateProjectionQueryResult {
  query: string
  params: Record<string, unknown>
}

type ProjectionMap = Record<string, {projection: ValidProjection; documentIds: Set<DocumentId>}>

export function createProjectionQuery(
  documentIds: Set<DocumentId>,
  documentProjections: {[TDocumentId in DocumentId]?: DocumentProjections},
  perspective?: PerspectiveHandle['perspective'],
): CreateProjectionQueryResult {
  const projections = Array.from(documentIds)
    .flatMap((id) => {
      const projectionsForDoc = documentProjections[id]
      if (!projectionsForDoc) return []

      return Object.entries(projectionsForDoc).map(([projectionHash, projection]) => ({
        documentId: id,
        projection,
        projectionHash,
      }))
    })
    .reduce<ProjectionMap>((acc, {documentId, projection, projectionHash}) => {
      const obj = acc[projectionHash] ?? {documentIds: new Set(), projection}
      obj.documentIds.add(documentId)

      acc[projectionHash] = obj
      return acc
    }, {})

  const query = `[${Object.entries(projections)
    .map(([projectionHash, {projection}]) => {
      return `...*[_id in $__ids_${projectionHash}]{_id,_type,_updatedAt,"__projectionHash":"${projectionHash}","result":{...${projection}}}`
    })
    .join(',')}]`

  const params = Object.fromEntries(
    Object.entries(projections).map(([projectionHash, value]) => {
      const idsInProjection = Array.from(value.documentIds).flatMap((id) => {
        const publishedId = getPublishedId(id)
        const draftId = getDraftId(id)
        const ids: string[] = [publishedId.toString(), draftId.toString()]

        // If we're in a release perspective, add the version ID
        if (
          typeof perspective === 'object' &&
          perspective !== null &&
          'releaseName' in perspective
        ) {
          const versionId = getVersionId(id, perspective.releaseName)
          // Add the version ID as a string since it's a valid ID in the query
          ids.push(versionId)
        }

        return ids
      })

      return [`__ids_${projectionHash}`, Array.from(idsInProjection)]
    }),
  )

  return {query, params}
}

interface ProcessProjectionQueryOptions {
  projectId: string
  dataset: string
  ids: Set<string>
  results: ProjectionQueryResult[]
  perspective?: PerspectiveHandle['perspective']
}

export function processProjectionQuery({
  ids,
  results,
  perspective,
}: ProcessProjectionQueryOptions): {
  [TDocumentId in string]?: DocumentProjectionValues<Record<string, unknown>>
} {
  const groupedResults: {
    [docId: string]: {
      [hash: string]: {
        draft?: ProjectionQueryResult
        published?: ProjectionQueryResult
        releaseVersion?: ProjectionQueryResult
      }
    }
  } = {}

  for (const result of results) {
    const originalId = getPublishedId(result._id)
    const hash = result.__projectionHash
    const isDraft = result._id === getDraftId(result._id)
    const isVersion =
      typeof perspective === 'object' &&
      perspective !== null &&
      'releaseName' in perspective &&
      getVersionId(result._id, perspective.releaseName) === result._id

    if (!ids.has(originalId)) continue

    if (!groupedResults[originalId]) {
      groupedResults[originalId] = {}
    }
    if (!groupedResults[originalId][hash]) {
      groupedResults[originalId][hash] = {}
    }

    if (isVersion) {
      groupedResults[originalId][hash].releaseVersion = result
    } else if (isDraft) {
      groupedResults[originalId][hash].draft = result
    } else {
      groupedResults[originalId][hash].published = result
    }
  }

  const finalValues: {
    [docId: string]: DocumentProjectionValues<Record<string, unknown>>
  } = {}

  for (const originalId of ids) {
    finalValues[originalId] = {}

    const projectionsForDoc = groupedResults[originalId]
    if (!projectionsForDoc) continue

    for (const hash in projectionsForDoc) {
      const {draft, published, releaseVersion} = projectionsForDoc[hash]

      // Layer the results according to priority: releaseVersion ?? draftVersion ?? publishedVersion
      const projectionResultData = releaseVersion?.result ?? draft?.result ?? published?.result

      if (!projectionResultData) {
        finalValues[originalId][hash] = {data: null, isPending: false}
        continue
      }

      const _status = {
        ...(releaseVersion?._updatedAt && {lastEditedReleaseVersionAt: releaseVersion._updatedAt}),
        ...(draft?._updatedAt && {lastEditedDraftAt: draft._updatedAt}),
        ...(published?._updatedAt && {lastEditedPublishedAt: published._updatedAt}),
      }

      finalValues[originalId][hash] = {
        data: {...projectionResultData, _status},
        isPending: false,
      }
    }
  }

  return finalValues
}
