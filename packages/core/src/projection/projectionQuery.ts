import {getDraftId, getPublishedId} from '../utils/ids'
import {
  type DocumentProjections,
  type DocumentProjectionValues,
  type ValidProjection,
} from './types'

export type ProjectionQueryResult = {
  _id: string
  _type: string
  _updatedAt: string
  result: Record<string, unknown>
  __projectionHash: string
}

interface CreateProjectionQueryResult {
  query: string
  params: Record<string, unknown>
}

type ProjectionMap = Record<string, {projection: ValidProjection; documentIds: Set<string>}>

export function createProjectionQuery(
  documentIds: Set<string>,
  documentProjections: {[TDocumentId in string]?: DocumentProjections},
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
      const idsInProjection = Array.from(value.documentIds).flatMap((id) => [
        getPublishedId(id),
        getDraftId(id),
      ])

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
}

export function processProjectionQuery({ids, results}: ProcessProjectionQueryOptions): {
  [TDocumentId in string]?: DocumentProjectionValues<Record<string, unknown>>
} {
  const groupedResults: {
    [docId: string]: {
      [hash: string]: {
        draft?: ProjectionQueryResult
        published?: ProjectionQueryResult
      }
    }
  } = {}

  for (const result of results) {
    const originalId = getPublishedId(result._id)
    const hash = result.__projectionHash
    const isDraft = result._id.startsWith('drafts.')

    if (!ids.has(originalId)) continue

    if (!groupedResults[originalId]) {
      groupedResults[originalId] = {}
    }
    if (!groupedResults[originalId][hash]) {
      groupedResults[originalId][hash] = {}
    }

    if (isDraft) {
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
      const {draft, published} = projectionsForDoc[hash]

      const projectionResultData = draft?.result ?? published?.result

      if (!projectionResultData) {
        finalValues[originalId][hash] = {data: null, isPending: false}
        continue
      }

      const _status = {
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
