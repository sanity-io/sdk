import {DocumentId} from '@sanity/id-utils'

import {type DocumentProjections, type DocumentProjectionValues} from './types'
import {validateProjection} from './util'

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

type ProjectionMap = Record<string, {projection: string; documentIds: Set<string>}>

export function createProjectionQuery(
  documentIds: Set<DocumentId>,
  documentProjections: {[TDocumentId in DocumentId]?: DocumentProjections},
): CreateProjectionQueryResult {
  const projections = Array.from(documentIds)
    .flatMap((id) => {
      const projectionsForDoc = documentProjections[id]
      if (!projectionsForDoc) return []

      return Object.entries(projectionsForDoc).map(([projectionHash, projection]) => ({
        documentId: id,
        projection: validateProjection(projection),
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
      const idsInProjection = Array.from(value.documentIds).flatMap((id) => DocumentId(id))
      return [`__ids_${projectionHash}`, Array.from(idsInProjection)]
    }),
  )

  return {query, params}
}

interface ProcessProjectionQueryOptions {
  ids: Set<string>
  results: ProjectionQueryResult[]
}

export function processProjectionQuery({ids, results}: ProcessProjectionQueryOptions): {
  [TDocumentId in string]?: DocumentProjectionValues<Record<string, unknown>>
} {
  const groupedResults: {
    [docId: string]: {
      [hash: string]: ProjectionQueryResult | undefined
    }
  } = {}

  for (const result of results) {
    const id = DocumentId(result._id)
    const hash = result.__projectionHash

    if (!ids.has(id)) continue

    if (!groupedResults[id]) {
      groupedResults[id] = {}
    }
    if (!groupedResults[id][hash]) {
      groupedResults[id][hash] = undefined
    }

    groupedResults[id][hash] = result
  }

  const finalValues: {
    [docId: string]: DocumentProjectionValues<Record<string, unknown>>
  } = {}

  for (const originalId of ids) {
    finalValues[originalId] = {}

    const projectionsForDoc = groupedResults[originalId]
    if (!projectionsForDoc) continue

    for (const hash in projectionsForDoc) {
      const projectionResultData = projectionsForDoc[hash]?.result

      if (!projectionResultData) {
        finalValues[originalId][hash] = {data: null, isPending: false}
        continue
      }

      const _status = {
        lastEditedDraftAt: projectionResultData['_updatedAt'] ?? undefined,
      }

      finalValues[originalId][hash] = {
        data: {...projectionResultData, _status},
        isPending: false,
      }
    }
  }

  return finalValues
}
