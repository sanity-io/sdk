import {
  getActiveReleasesState,
  type ReleaseDocument,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 */
type UseActiveReleases = {
  (): ReleaseDocument[]
}

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
export const useActiveReleases: UseActiveReleases = createStateSourceHook({
  getState: getActiveReleasesState as (instance: SanityInstance) => StateSource<ReleaseDocument[]>,
  shouldSuspend: (instance: SanityInstance) =>
    getActiveReleasesState(instance, {}).getCurrent() === undefined,
  suspender: (instance: SanityInstance) =>
    firstValueFrom(getActiveReleasesState(instance, {}).observable.pipe(filter(Boolean))),
})
