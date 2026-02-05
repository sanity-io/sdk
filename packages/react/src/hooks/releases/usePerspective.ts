import {
  type DatasetHandle,
  type DocumentSource,
  getPerspectiveState,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {
  useNormalizedSourceOptions,
  type WithSourceNameSupport,
} from '../helpers/useNormalizedSourceOptions'

/**
 * @public
 * @function
 *
 * Returns a single or stack of perspectives for the given perspective handle,
 * which can then be used to correctly query the documents
 * via the `perspective` parameter in the client.
 *
 * @param perspectiveHandle - The perspective handle to get the perspective for.
 * @category Documents
 * @example
 * ```tsx
 * import {usePerspective, useQuery} from '@sanity/sdk-react'

 * const perspective = usePerspective({perspective: 'rxg1346', projectId: 'abc123', dataset: 'production'})
 * const {data} = useQuery<Movie[]>('*[_type == "movie"]', {
 *   perspective: perspective,
 * })
 * ```
 *
 * @returns The perspective for the given perspective handle.
 */
type UsePerspective = {
  (perspectiveHandle: DatasetHandle): string | string[]
}

const usePerspectiveValue: UsePerspective = createStateSourceHook({
  getState: getPerspectiveState as (
    instance: SanityInstance,
    perspectiveHandle?: {source?: DocumentSource},
  ) => StateSource<string | string[]>,
  shouldSuspend: (instance: SanityInstance, options: {source?: DocumentSource}): boolean =>
    getPerspectiveState(instance, options).getCurrent() === undefined,
  suspender: (instance: SanityInstance, _options?: {source?: DocumentSource}) =>
    firstValueFrom(getPerspectiveState(instance, _options ?? {}).observable.pipe(filter(Boolean))),
})

/**
 * @public
 * @function
 */
export const usePerspective: UsePerspective = (
  options: WithSourceNameSupport<DatasetHandle> | undefined,
) => {
  const normalizedOptions = useNormalizedSourceOptions(options ?? {})
  return usePerspectiveValue(normalizedOptions)
}
