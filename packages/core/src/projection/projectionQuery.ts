import {
  type DocumentId,
  getDraftId,
  getPublishedId,
  getVersionId,
  isVersionId,
} from '@sanity/id-utils'

import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {
  type DocumentConfigs,
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

type ProjectionMap = Record<
  string,
  {
    projection: ValidProjection
    ids: DocumentId[]
  }
>

export function createProjectionQuery(
  documentIds: Set<DocumentId>,
  documentProjections: {[TDocumentId in DocumentId]?: DocumentProjections},
  projectionConfigs: {[TDocumentId in DocumentId]?: DocumentConfigs},
): CreateProjectionQueryResult {
  const projections = Array.from(documentIds)
    .flatMap((id) => {
      const projectionsForDoc = documentProjections[id]
      if (!projectionsForDoc) return []

      return Object.entries(projectionsForDoc).map(([projectionHash, projection]) => ({
        documentId: id,
        projection,
        projectionHash,
        config: projectionConfigs[id]?.[projectionHash],
      }))
    })
    .reduce<ProjectionMap>((acc, {documentId, projection, projectionHash, config}) => {
      if (!config) return acc

      const obj = acc[projectionHash] ?? {
        projection,
        ids: [],
      }

      // Always add published and draft IDs
      const publishedId = getPublishedId(documentId)
      const draftId = getDraftId(documentId)
      obj.ids.push(publishedId, draftId)

      // Add version ID if needed
      if (isReleasePerspective(config['perspective'])) {
        const releaseName = (config['perspective'] as {releaseName: string}).releaseName
        const versionId = getVersionId(documentId, releaseName)
        obj.ids.push(versionId)
      }

      acc[projectionHash] = obj
      return acc
    }, {})

  const query = `[${Object.entries(projections)
    .map(([projectionHash, {projection}]) => {
      return `...*[_id in $__ids_${projectionHash}]{_id,_type,_updatedAt,"__projectionHash":"${projectionHash}","result":{...${projection}}}`
    })
    .join(',')}]`

  const params = Object.fromEntries(
    Object.entries(projections).map(([projectionHash, {ids}]) => {
      return [`__ids_${projectionHash}`, ids]
    }),
  )

  return {query, params}
}

interface ProcessProjectionQueryOptions {
  projectId: string
  dataset: string
  ids: Set<string>
  results: ProjectionQueryResult[]
}

export function processProjectionQuery({ids, results}: ProcessProjectionQueryOptions): {
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
    const isVersion = isVersionId(result._id)

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
      // We should only have a releaseVersion if this projection was fetched with a release perspective config
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
