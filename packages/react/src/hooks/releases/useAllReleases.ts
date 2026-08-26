import {
  type DocumentResource,
  getAllReleasesState,
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

type UseAllReleasesValue = {
  (options?: {resource?: DocumentResource}): ReleaseDocument[]
}

const useAllReleasesValue: UseAllReleasesValue = createStateSourceHook({
  getState: getAllReleasesState as (
    instance: SanityInstance,
    options?: {resource?: DocumentResource},
  ) => StateSource<ReleaseDocument[]>,
  shouldSuspend: (instance: SanityInstance, options?: {resource?: DocumentResource}) =>
    getAllReleasesState(instance, options ?? {}).getCurrent() === undefined,
  suspender: (instance: SanityInstance, options?: {resource?: DocumentResource}) =>
    firstValueFrom(getAllReleasesState(instance, options ?? {}).observable.pipe(filter(Boolean))),
})

/**
 * @public
 * @function
 *
 * Returns every release the dataset has — including `archived`, `published`,
 * and mid-transition states (`archiving`, `unarchiving`, `publishing`,
 * `scheduling`).
 *
 * Use this hook when you're building a release-management UI (listing
 * releases, surfacing lifecycle controls, etc.) so a release stays visible
 * across its full lifecycle — including after it's been published or
 * archived. For perspective / content queries, prefer
 * {@link useActiveReleases}, which filters to releases that still affect
 * what's queryable.
 *
 * @returns Every release for the current project, sorted to match the order
 * used by {@link useActiveReleases}.
 * @category Releases
 * @example
 * ```tsx
 * import {useAllReleases} from '@sanity/sdk-react'
 *
 * const releases = useAllReleases()
 * ```
 */
export function useAllReleases(
  options?: WithResourceNameSupport<SanityConfig> | undefined,
): ReleaseDocument[] {
  const normalizedOptions = useNormalizedResourceOptions(options ?? {})
  return useAllReleasesValue(normalizedOptions)
}
