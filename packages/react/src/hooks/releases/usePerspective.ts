import {
  type DocumentResource,
  getPerspectiveState,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {type ResourceHandle} from '../../config/handles'
import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'

type UsePerspectiveValue = {
  (perspectiveHandle: {resource?: DocumentResource}): string | string[]
}

const usePerspectiveValue: UsePerspectiveValue = createStateSourceHook({
  getState: getPerspectiveState as (
    instance: SanityInstance,
    perspectiveHandle?: {resource?: DocumentResource},
  ) => StateSource<string | string[]>,
  shouldSuspend: (instance: SanityInstance, options: {resource?: DocumentResource}): boolean =>
    getPerspectiveState(instance, options).getCurrent() === undefined,
  suspender: (instance: SanityInstance, _options?: {resource?: DocumentResource}) =>
    firstValueFrom(getPerspectiveState(instance, _options ?? {}).observable.pipe(filter(Boolean))),
})

/**
 * Returns a single or stack of perspectives for the given perspective handle,
 * which can then be used to correctly query the documents
 * via the `perspective` parameter in the client.
 *
 * @public
 * @param perspectiveHandle - The perspective handle to get the perspective for.
 * @category Documents
 * @example
 * ```tsx
 * import {usePerspective, useQuery} from '@sanity/sdk-react'
 *
 * const perspective = usePerspective({perspective: 'rxg1346', projectId: 'abc123', dataset: 'production'})
 * const {data} = useQuery<Movie[]>('*[_type == "movie"]', {
 *   perspective: perspective,
 * })
 * ```
 *
 * @returns The perspective for the given perspective handle.
 */
export function usePerspective(perspectiveHandle?: ResourceHandle): string | string[] {
  const normalizedOptions = useNormalizedResourceOptions(perspectiveHandle ?? {})
  return usePerspectiveValue(normalizedOptions)
}
