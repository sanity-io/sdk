import {hashString} from '../utils/hashString'
import {getDraftId, getPublishedId} from '../utils/ids'
import {type ProjectionValuePending, type ValidProjection} from './projectionStore'
import {validateProjection} from './util'

type ProjectionQueryResult = {
  _id: string
  _type: string
  _updatedAt: string
  result: Record<string, unknown>
}

interface CreateProjectionQueryResult {
  query: string
  params: Record<string, unknown>
}

type ProjectionMap = Record<string, {projection: ValidProjection; documentIds: Set<string>}>

export function createProjectionQuery(
  documentIds: Set<string>,
  documentProjections: {[TDocumentId in string]?: string},
): CreateProjectionQueryResult {
  const projections = Array.from(documentIds)
    .filter((id) => documentProjections[id])
    .map((id) => {
      const projection = validateProjection(documentProjections[id]!)
      const projectionHash = hashString(projection)
      return {documentId: id, projection, projectionHash}
    })
    .reduce<ProjectionMap>((acc, {documentId, projection, projectionHash}) => {
      const obj = acc[projectionHash] ?? {documentIds: new Set(), projection}
      obj.documentIds.add(documentId)

      acc[projectionHash] = obj
      return acc
    }, {})

  const query = `[${Object.entries(projections)
    .map(([projectionHash, {projection}]) => {
      return `...*[_id in $__ids_${projectionHash}]{_id,_type,_updatedAt,"result":{...${projection}}}`
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
  [TDocumentId in string]?: ProjectionValuePending<Record<string, unknown>>
} {
  const resultMap = results.reduce<{[TDocumentId in string]?: ProjectionQueryResult}>(
    (acc, next) => {
      acc[next._id] = next
      return acc
    },
    {},
  )

  return Object.fromEntries(
    Array.from(ids).map((id): [string, ProjectionValuePending<Record<string, unknown>>] => {
      const publishedId = getPublishedId(id)
      const draftId = getDraftId(id)

      const draftResult = resultMap[draftId]
      const publishedResult = resultMap[publishedId]

      const projectionResult = draftResult?.result ?? publishedResult?.result
      if (!projectionResult) return [id, {data: null, isPending: false}]

      const status = {
        ...(draftResult?._updatedAt && {lastEditedDraftAt: draftResult._updatedAt}),
        ...(publishedResult?._updatedAt && {lastEditedPublishedAt: publishedResult._updatedAt}),
      }

      return [id, {data: {...projectionResult, status}, isPending: false}]
    }),
  )
}
