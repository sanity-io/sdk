import {getDraftId, getPublishedId} from '../utils/ids'
import {type DocumentProjections, type DocumentProjectionValues} from './types'
import {validateProjection} from './util'

export interface ProjectionQueryResult {
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

interface ProjectionStatus {
  _id: string
  _updatedAt: string
}

export interface ProjectionStatusQueryResult {
  published: ProjectionStatus[]
  drafts: ProjectionStatus[]
  versions: ProjectionStatus[]
}

type ProjectionMap = Record<string, {projection: string; documentIds: Set<string>}>

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
      // Use original (published) ids only; rely on perspective layering in backend
      const idsInProjection = Array.from(value.documentIds).map((id) => getPublishedId(id))
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
  const finalValues: {
    [docId: string]: DocumentProjectionValues<Record<string, unknown>>
  } = {}

  for (const originalId of ids) {
    finalValues[originalId] = {}
  }

  for (const result of results) {
    const originalId = getPublishedId(result._id)
    if (!ids.has(originalId)) continue
    const hash = result.__projectionHash
    const projectionResultData = result.result
    if (!finalValues[originalId]) finalValues[originalId] = {}
    finalValues[originalId][hash] = {
      data: {...projectionResultData, _status: {}},
      isPending: false,
    }
  }

  return finalValues
}

// Status meta query: returns lastEdited timestamps for published and drafts in a single batch
export function createProjectionStatusQuery(
  documentIds: Set<string>,
  releaseNames?: string[],
): CreateProjectionQueryResult {
  const publishedIds = Array.from(documentIds).map((id) => getPublishedId(id))
  const draftIds = Array.from(documentIds).map((id) => getDraftId(id))

  const versionIds = (releaseNames ?? []).flatMap((releaseName) =>
    publishedIds.map((baseId) => `versions.${releaseName}.${baseId}`),
  )

  const query =
    '{"published": *[_id in $__published]{_id,_updatedAt}, "drafts": *[_id in $__drafts]{_id,_updatedAt}, "versions": *[_id in $__versionIds]{_id,_updatedAt}}'
  const params = {
    __published: publishedIds,
    __drafts: draftIds,
    __versionIds: versionIds,
  }
  return {query, params}
}
