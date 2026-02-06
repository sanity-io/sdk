import {
  type DocumentSource,
  getActiveReleasesState,
  type ReleaseDocument,
  type SanityConfig,
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
type UseActiveReleases = {
  (options?: WithSourceNameSupport<SanityConfig> | undefined): ReleaseDocument[]
}

const useActiveReleasesValue: UseActiveReleases = createStateSourceHook({
  getState: getActiveReleasesState as (
    instance: SanityInstance,
    options?: {source?: DocumentSource},
  ) => StateSource<ReleaseDocument[]>,
  shouldSuspend: (instance: SanityInstance, options?: {source?: DocumentSource}) =>
    getActiveReleasesState(instance, options ?? {}).getCurrent() === undefined,
  suspender: (instance: SanityInstance, options?: {source?: DocumentSource}) =>
    firstValueFrom(
      getActiveReleasesState(instance, options ?? {}).observable.pipe(filter(Boolean)),
    ),
})

/**
 * @public
 * @function
 */
export const useActiveReleases: UseActiveReleases = (
  options: WithSourceNameSupport<{source?: DocumentSource}> | undefined,
) => {
  const normalizedOptions = useNormalizedSourceOptions(options ?? {})
  return useActiveReleasesValue(normalizedOptions)
}
