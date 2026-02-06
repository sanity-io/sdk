import {map} from 'rxjs'

import {type DocumentHandle} from '../config/sanityConfig'
import {getProjectionState} from '../projection/getProjectionState'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {PREVIEW_PROJECTION} from './previewConstants'
import {transformProjectionToPreview} from './previewProjectionUtils'
import {type PreviewQueryResult, type PreviewValue, type ValuePending} from './types'

/**
 * @beta
 * @deprecated This type is deprecated and will be removed in a future release.
 */
export type GetPreviewStateOptions = DocumentHandle

/**
 * @beta
 * @deprecated This function is deprecated and will be removed in a future release.
 */
export function getPreviewState<TResult extends object>(
  instance: SanityInstance,
  options: GetPreviewStateOptions,
): StateSource<ValuePending<TResult>>
/**
 * @beta
 * @deprecated This function is deprecated and will be removed in a future release.
 */
export function getPreviewState(
  instance: SanityInstance,
  options: GetPreviewStateOptions,
): StateSource<ValuePending<PreviewValue>>
/**
 * @beta
 * @deprecated This function is deprecated and will be removed in a future release.
 */
export function getPreviewState(
  instance: SanityInstance,
  options: GetPreviewStateOptions,
): StateSource<ValuePending<PreviewValue>> {
  // Get the projection state
  const projectionState = getProjectionState<PreviewQueryResult>(instance, {
    ...options,
    projection: PREVIEW_PROJECTION,
  })

  // Transform helper to convert projection result to preview format
  const transformResult = (
    current: ReturnType<typeof projectionState.getCurrent>,
  ): ValuePending<PreviewValue> => {
    if (!current || current.data === null) {
      return {data: null, isPending: current?.isPending ?? false}
    }

    const previewValue = transformProjectionToPreview(instance, current.data, options.source)

    return {
      data: previewValue,
      isPending: current.isPending,
    }
  }

  // Wrap the state source to transform projection results to preview format
  return {
    getCurrent: () => transformResult(projectionState.getCurrent()),
    subscribe: (callback) => projectionState.subscribe(callback),
    observable: projectionState.observable.pipe(map(transformResult)),
  }
}
