import {
  type DocumentResource,
  getPerspectiveState,
  type ResourceHandle,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {
  useNormalizedResourceOptions,
  type WithResourceNameSupport,
} from '../helpers/useNormalizedResourceOptions'

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
 *
 * const perspective = usePerspective({
 *   perspective: 'rxg1346',
 *   resource: {projectId: 'abc123', dataset: 'production'},
 * })
 * const {data} = useQuery<Movie[]>({
 *   query: '*[_type == "movie"]',
 *   perspective,
 * })
 * ```
 *
 * @returns The perspective for the given perspective handle.
 */
type UsePerspective = {
  (perspectiveHandle?: WithResourceNameSupport<ResourceHandle>): string | string[]
}

const usePerspectiveValue = createStateSourceHook({
  getState: getPerspectiveState as (
    instance: SanityInstance,
    perspectiveHandle: ResourceHandle,
  ) => StateSource<string | string[]>,
  shouldSuspend: (instance: SanityInstance, options: {resource: DocumentResource}): boolean =>
    getPerspectiveState(instance, options).getCurrent() === undefined,
  suspender: (instance: SanityInstance, _options?: {resource: DocumentResource}) =>
    firstValueFrom(getPerspectiveState(instance, _options).observable.pipe(filter(Boolean))),
})

/**
 * @public
 * @function
 */
export const usePerspective: UsePerspective = (
  options: WithResourceNameSupport<ResourceHandle> | undefined,
) => {
  const normalizedOptions = useNormalizedResourceOptions(options ?? {})
  return usePerspectiveValue(normalizedOptions as ResourceHandle)
}
