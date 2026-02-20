import {type SanityClient} from '@sanity/client'
import {createImageUrlBuilder} from '@sanity/image-url'
import {isObject} from 'lodash-es'

import {getClient} from '../client/clientStore'
import {type DocumentSource, isDatasetSource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {SUBTITLE_CANDIDATES, TITLE_CANDIDATES} from './previewConstants'
import {type PreviewQueryResult, type PreviewValue} from './types'

const API_VERSION = 'v2025-05-06'

/**
 * Checks if the provided value has `_ref` property that is a string and starts with `image-`
 */
function hasImageRef<T>(value: unknown): value is T & {_ref: string} {
  return isObject(value) && '_ref' in value && typeof (value as {_ref: unknown})._ref === 'string'
}

/**
 * Normalizes a media asset to a preview value.
 * Adds a url to a media asset reference using `@sanity/image-url`.
 *
 * @internal
 */
export function normalizeMedia(media: unknown, client: SanityClient): PreviewValue['media'] {
  if (!media) return null
  if (!hasImageRef(media)) return null

  const builder = createImageUrlBuilder(client)
  const url = builder.image({_ref: media._ref}).url()

  return {
    type: 'image-asset',
    _ref: media._ref,
    url,
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

/**
 * Transforms a projection result (with titleCandidates, subtitleCandidates, media)
 * into a PreviewValue (with title, subtitle, media).
 *
 * @param projectionResult - The raw projection result from GROQ
 * @param instance - The Sanity instance to use for client configuration
 * @param source - Data source for the preview
 * @internal
 */
export function transformProjectionToPreview(
  instance: SanityInstance,
  projectionResult: PreviewQueryResult,
  source?: DocumentSource,
): PreviewValue {
  const title = findFirstDefined(TITLE_CANDIDATES, projectionResult.titleCandidates)
  const subtitle = findFirstDefined(SUBTITLE_CANDIDATES, projectionResult.subtitleCandidates, title)

  // Get a client for the source (if provided) or use the instance config
  const client = getClient(instance, {
    apiVersion: API_VERSION,
    // TODO: remove in v3 when we're ready for everything to be queried via source
    source: source && !isDatasetSource(source) ? source : undefined,
  })

  return {
    title: String(title || `${projectionResult._type}: ${projectionResult._id}`),
    subtitle: subtitle || undefined,
    media: normalizeMedia(projectionResult.media, client),
    ...(projectionResult._status && {_status: projectionResult._status}),
  }
}
