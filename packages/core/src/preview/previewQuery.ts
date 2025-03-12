import {type Schema} from '@sanity/types'

import {hashString} from '../common/util'
import {getDraftId, getPublishedId} from '../utils/ids'
import {getPreviewProjection} from './getPreviewProjection'
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

function findFirstDefined<T extends Record<string, unknown>>(
  candidates: T | undefined | null,
  exclude?: unknown,
): string | undefined {
  if (!candidates) return undefined

  return Object.values(candidates).find(
    (value): value is string =>
      typeof value === 'string' && value.trim() !== '' && value !== exclude,
  )
}

export function processPreviewQuery({
  projectId,
  dataset,
  ids,
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

      if (!draftResult && !publishedResult) return [id, STABLE_EMPTY_PREVIEW]

      try {
        const result = draftResult || publishedResult
        if (!result) return [id, STABLE_EMPTY_PREVIEW]
        const title = findFirstDefined(result.titleCandidates)
        const subtitle = findFirstDefined(result.subtitleCandidates, title)

        const preview: Omit<PreviewValue, 'status'> = {
          title: String(title || `${result._type}: ${result._id}`),
          subtitle: subtitle || undefined,
          media: normalizeMedia(result.media, projectId, dataset),
        }

        const status: PreviewValue['status'] = {
          ...(draftResult?._updatedAt && {lastEditedDraftAt: draftResult._updatedAt}),
          ...(publishedResult?._updatedAt && {lastEditedPublishedAt: publishedResult._updatedAt}),
        }

        return [id, {results: {...preview, status}, isPending: false}]
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(e)
        return [id, STABLE_ERROR_PREVIEW]
      }
    }),
  )
}

interface CreatePreviewQueryResult {
  query: string
  params: Record<string, unknown>
}

export function createPreviewQuery(documentIds: Set<string>): CreatePreviewQueryResult {
  // Create arrays of draft and published IDs
  const allIds = Array.from(documentIds).flatMap((id) => [getPublishedId(id), getDraftId(id)])
  const projection = getPreviewProjection()
  const queryHash = hashString(projection)

  return {
    query: `*[_id in $__ids_${queryHash}]${projection}`,
    params: {
      [`__ids_${queryHash}`]: allIds,
    },
  }
}
