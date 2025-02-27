import {type Schema} from '@sanity/types'

import {hashString} from '../common/util'
import {getDraftId, getPublishedId} from '../utils/ids'
import {getProjectionForSchemaType} from './getProjectionForSchemaType'
import {
  type PreviewQueryResult,
  type PreviewStoreState,
  type PreviewValue,
  type ValuePending,
} from './previewStore'
import {STABLE_EMPTY_PREVIEW, STABLE_ERROR_PREVIEW} from './util'

interface ProcessPreviewQueryOptions {
  projectId: string
  dataset: string
  schema: Schema
  ids: Set<string>
  documentTypes: {[TDocumentId in string]?: string}
  results: PreviewQueryResult[]
}

function defaultPrepare(value: Record<string, unknown>): PreviewValue {
  let title
  let subtitle

  if ('title' in value) {
    if (typeof value['title'] === 'string') {
      title = value['title']
    }
  }

  if ('subtitle' in value) {
    if (typeof value['subtitle'] === 'string') {
      subtitle = value['subtitle']
    }
  }

  return {title: title ?? 'Untitled', subtitle}
}

function hasImageAsset<T>(value: unknown): value is T & {asset: {_ref: string}} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'asset' in value &&
    typeof (value as {asset: unknown}).asset === 'object' &&
    typeof (value as {asset: {_ref: unknown}}).asset?._ref === 'string'
  )
}

function assetIdToUrl(assetId: string, projectId: string, dataset: string) {
  const pattern = /^image-(?<assetName>[A-Za-z0-9]+)-(?<dimensions>\d+x\d+)-(?<format>[a-z]+)$/
  const match = assetId.match(pattern)
  if (!match?.groups) {
    throw new Error(
      `Invalid asset ID \`${assetId}\`. Expected: image-{assetName}-{width}x{height}-{format}`,
    )
  }

  const {assetName, dimensions, format} = match.groups
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${assetName}-${dimensions}.${format}`
}

export function normalizeMedia(
  media: unknown,
  projectId: string,
  dataset: string,
): PreviewValue['media'] {
  if (!media) return null
  if (!hasImageAsset(media)) return null
  return {type: 'image-asset', url: assetIdToUrl(media.asset._ref, projectId, dataset)}
}

interface PreparePreviewForSchemaTypeOptions {
  projectId: string
  dataset: string
  schema: Schema
  schemaTypeName: string
  selectResult: PreviewQueryResult['select']
}

export function preparePreviewForSchemaType({
  projectId,
  dataset,
  schema,
  schemaTypeName,
  selectResult,
}: PreparePreviewForSchemaTypeOptions): Omit<PreviewValue, 'status'> {
  const schemaType = schema.get(schemaTypeName)
  if (!schemaType) {
    throw new Error(
      `Could not find schema type \`${schemaTypeName}\` in schema \`${schema.name}\`.`,
    )
  }
  const prepare = (schemaType.preview?.prepare ?? defaultPrepare) as (val: unknown) => PreviewValue

  try {
    const result = prepare(selectResult)
    return {...result, media: normalizeMedia(result.media, projectId, dataset)}
  } catch (e) {
    const message =
      typeof e === 'object' && e && 'message' in e && typeof e.message === 'string'
        ? e.message
        : 'Unknown error.'

    throw new Error(`Failed to prepare preview: ${message}`, {cause: e})
  }
}

export function processPreviewQuery({
  projectId,
  dataset,
  schema,
  ids,
  documentTypes,
  results,
}: ProcessPreviewQueryOptions): PreviewStoreState['values'] {
  const resultMap = results.reduce<{[TDocumentId in string]?: PreviewQueryResult}>((acc, next) => {
    acc[next._id] = next
    return acc
  }, {})

  return Object.fromEntries(
    Array.from(ids).map((id): [string, ValuePending<PreviewValue>] => {
      const publishedId = getPublishedId(id)
      const draftId = getDraftId(id)

      const draftResult = resultMap[draftId]
      const publishedResult = resultMap[publishedId]
      const documentType = documentTypes[publishedId]
      if (!documentType) return [id, STABLE_EMPTY_PREVIEW]

      const selectResult = draftResult?.select ?? publishedResult?.select
      if (!selectResult) return [id, STABLE_EMPTY_PREVIEW]

      try {
        const preview = preparePreviewForSchemaType({
          projectId,
          dataset,
          schema,
          schemaTypeName: documentType,
          selectResult,
        })
        const status: PreviewValue['status'] = {
          ...(draftResult?._updatedAt && {lastEditedDraftAt: draftResult._updatedAt}),
          ...(publishedResult?._updatedAt && {lastEditedPublishedAt: publishedResult._updatedAt}),
        }

        return [id, {results: {...preview, status}, isPending: false}]
      } catch (e) {
        // TODO: replace this with bubbling the error
        // eslint-disable-next-line no-console
        console.warn(e)
        return [id, STABLE_ERROR_PREVIEW]
      }
    }),
  )
}

type ProjectionMap = Record<string, {projection: string; documentTypes: Set<string>}>

interface CreatePreviewQueryResult {
  query: string
  params: Record<string, string[]>
}

export function createPreviewQuery(
  documentIds: Set<string>,
  documentTypes: {[TDocumentId in string]?: string},
  schema: Schema,
): CreatePreviewQueryResult {
  const documentIdsByDocumentType = Array.from(documentIds).reduce<Record<string, Set<string>>>(
    (acc, id) => {
      const documentType = documentTypes[id]
      if (!documentType) return acc

      const ids = acc[documentType] ?? new Set()
      ids.add(id)
      acc[documentType] = ids

      return acc
    },
    {},
  )

  const projections = Object.keys(documentIdsByDocumentType)
    .map((documentType) => {
      const projection = getProjectionForSchemaType(schema, documentType)
      const projectionHash = hashString(projection)
      return {documentType, projection, projectionHash}
    })
    .reduce<ProjectionMap>((acc, {documentType, projection, projectionHash}) => {
      const obj = acc[projectionHash] ?? {documentTypes: new Set(), projection}
      obj.documentTypes.add(documentType)

      acc[projectionHash] = obj
      return acc
    }, {})

  const query = `[${Object.entries(projections)
    .map(([projectionHash, {projection}]) => {
      return `...*[_id in $__ids_${projectionHash}]{_id,_type,_updatedAt,"select":${projection}}`
    })
    .join(',')}]`

  const params = Object.fromEntries(
    Object.entries(projections).map(([projectionHash, value]) => {
      const idsInProjection = Array.from(
        Array.from(value.documentTypes)
          .map((documentType) => documentIdsByDocumentType[documentType] ?? new Set<string>())
          .reduce((acc, next) => {
            for (const i of next) acc.add(i)
            return acc
          }, new Set<string>()),
      ).flatMap((id) => [getPublishedId(id), getDraftId(id)])

      return [`__ids_${projectionHash}`, Array.from(idsInProjection)]
    }),
  )

  return {query, params}
}
