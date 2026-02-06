import {type DocumentHandle} from '../config/sanityConfig'
import {resolveProjection} from '../projection/resolveProjection'
import {type SanityInstance} from '../store/createSanityInstance'
import {PREVIEW_PROJECTION} from './previewConstants'
import {transformProjectionToPreview} from './previewProjectionUtils'
import {type PreviewQueryResult, type PreviewValue, type ValuePending} from './types'

/**
 * @beta
 * @deprecated This type is deprecated and will be removed in a future release.
 */
export type ResolvePreviewOptions = DocumentHandle

/**
 * @beta
 * @deprecated This function is deprecated and will be removed in a future release.
 */
export async function resolvePreview(
  instance: SanityInstance,
  options: ResolvePreviewOptions,
): Promise<ValuePending<PreviewValue>> {
  // Resolve the projection
  const projectionResult = await resolveProjection<PreviewQueryResult>(instance, {
    ...options,
    projection: PREVIEW_PROJECTION,
  })

  if (!projectionResult.data) {
    return {data: null, isPending: projectionResult.isPending}
  }

  // Transform to preview format
  const previewValue = transformProjectionToPreview(instance, projectionResult.data, options.source)

  return {
    data: previewValue,
    isPending: projectionResult.isPending,
  }
}
