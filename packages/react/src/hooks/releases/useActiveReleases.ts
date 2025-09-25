import {getActiveReleasesState, type ReleaseDocument} from '@sanity/sdk'
import {useMemo} from 'react'

import {useSanityInstanceAndSource} from '../context/useSanityInstance'
import {useStoreState} from '../helpers/useStoreState'

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
export const useActiveReleases: UseActiveReleases = () => {
  const [instance, source] = useSanityInstanceAndSource({})
  const state = useMemo(() => getActiveReleasesState(instance, {source}), [instance, source])
  return useStoreState(state)
}
