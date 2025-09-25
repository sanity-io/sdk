import {
  getActiveReleasesState,
  getPerspectiveState,
  type PerspectiveHandle,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 */
type UsePerspective = {
  (perspectiveHandle: PerspectiveHandle): string | string[]
}

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
export const usePerspective: UsePerspective = createStateSourceHook({
  getState: getPerspectiveState as (
    instance: SanityInstance,
    perspectiveHandle?: PerspectiveHandle,
  ) => StateSource<string | string[]>,
  shouldSuspend: (instance: SanityInstance, options: PerspectiveHandle): boolean =>
    getPerspectiveState(instance, options).getCurrent() === undefined,
  suspender: (instance: SanityInstance, _options?: PerspectiveHandle) =>
    firstValueFrom(getActiveReleasesState(instance, {}).observable.pipe(filter(Boolean))),
})
