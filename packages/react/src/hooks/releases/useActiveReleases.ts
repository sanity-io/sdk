import {
  type DocumentResource,
  getActiveReleasesState,
  type ReleaseDocument,
  type SanityConfig,
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

 * Returns the active releases for the current project,
 * represented as a list of release documents.
 *
 * @returns The active releases for the current project.
 * @category Projects
 * @example
 * ```tsx
 * import {useActiveReleases} from '@sanity/sdk-react'
 *
 * const activeReleases = useActiveReleases()
 * ```
 */
type UseActiveReleasesValue = {
  (options?: {resource?: DocumentResource}): ReleaseDocument[]
}

const useActiveReleasesValue: UseActiveReleasesValue = createStateSourceHook({
  getState: getActiveReleasesState as (
    instance: SanityInstance,
    options?: {resource?: DocumentResource},
  ) => StateSource<ReleaseDocument[]>,
  shouldSuspend: (instance: SanityInstance, options?: {resource?: DocumentResource}) =>
    getActiveReleasesState(instance, options ?? {}).getCurrent() === undefined,
  suspender: (instance: SanityInstance, options?: {resource?: DocumentResource}) =>
    firstValueFrom(
      getActiveReleasesState(instance, options ?? {}).observable.pipe(filter(Boolean)),
    ),
})

/**
 * @public
 * @function
 */
export function useActiveReleases(
  options?: WithResourceNameSupport<SanityConfig> | undefined,
): ReleaseDocument[] {
  const normalizedOptions = useNormalizedResourceOptions(options ?? {})
  return useActiveReleasesValue(normalizedOptions)
}
