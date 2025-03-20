import {isObject} from 'lodash-es'

import {hashString} from '../utils/hashString'
import {getDraftId, getPublishedId} from '../utils/ids'
import {PREVIEW_PROJECTION, SUBTITLE_CANDIDATES, TITLE_CANDIDATES} from './previewConstants'
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
  ids: Set<string>
  results: PreviewQueryResult[]
}

/**
 * Converts an asset ID to a URL.
 *
 * @internal
 */
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

/**
 * Checks if the provided value has `_ref` property that is a string and starts with `image-`
 */
function hasImageRef<T>(value: unknown): value is T & {_ref: string} {
  return isObject(value) && '_ref' in value && typeof (value as {_ref: unknown})._ref === 'string'
}

/**
 * Normalizes a media asset to a preview value.
 * Adds a url to a media asset reference.
 *
 * @internal
 */
export function normalizeMedia(
  media: unknown,
  projectId: string,
  dataset: string,
): PreviewValue['media'] {
  if (!media) return null
  if (!hasImageRef(media)) return null
  return {
    type: 'image-asset',
    _ref: media._ref,
    url: assetIdToUrl(media._ref, projectId, dataset),
  }
}

/**
 * Finds a single field value from a set of candidates based on a priority list of field names.
 * Returns the first non-empty string value found from the candidates matching the priority list order.
 *
 * @internal
 */
function findFirstDefined(
  fieldsToSearch: string[],
  candidates: Record<string, unknown>,
  exclude?: unknown,
): string | undefined {
  if (!candidates) return undefined

  for (const field of fieldsToSearch) {
    const value = candidates[field]
    if (typeof value === 'string' && value.trim() !== '' && value !== exclude) {
      return value
    }
  }

  return undefined
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
        const title = findFirstDefined(TITLE_CANDIDATES, result.titleCandidates)
        const subtitle = findFirstDefined(SUBTITLE_CANDIDATES, result.subtitleCandidates, title)
        const preview: Omit<PreviewValue, 'status'> = {
          title: String(title || `${result._type}: ${result._id}`),
          subtitle: subtitle || undefined,
          media: normalizeMedia(result.media, projectId, dataset),
        }

        const status: PreviewValue['status'] = {
          ...(draftResult?._updatedAt && {lastEditedDraftAt: draftResult._updatedAt}),
          ...(publishedResult?._updatedAt && {lastEditedPublishedAt: publishedResult._updatedAt}),
        }

        return [id, {data: {...preview, status}, isPending: false}]
      } catch (e) {
        // TODO: replace this with bubbling the error
        // eslint-disable-next-line no-console
        console.warn(e)
        return [id, STABLE_ERROR_PREVIEW]
      }
    }),
  )
}

interface CreatePreviewQueryResult {
  query: string
  params: Record<string, string[]>
}

export function createPreviewQuery(documentIds: Set<string>): CreatePreviewQueryResult {
  // Create arrays of draft and published IDs
  const allIds = Array.from(documentIds).flatMap((id) => [getPublishedId(id), getDraftId(id)])
  const queryHash = hashString(PREVIEW_PROJECTION)

  return {
    query: `*[_id in $__ids_${queryHash}]${PREVIEW_PROJECTION}`,
    params: {
      [`__ids_${queryHash}`]: allIds,
    },
  }
}
