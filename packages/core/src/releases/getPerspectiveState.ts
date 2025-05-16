import {createSelector} from 'reselect'

import {type PerspectiveHandle, type ReleasePerspective} from '../config/sanityConfig'
import {bindActionByDataset} from '../store/createActionBinder'
import {createStateSourceAction, type SelectorContext} from '../store/createStateSourceAction'
import {releasesStore, type ReleasesStoreState} from './releasesStore'
import {sortReleases} from './utils/sortReleases'

function isReleasePerspective(
  perspective: PerspectiveHandle['perspective'],
): perspective is ReleasePerspective {
  return typeof perspective === 'object' && perspective !== null && 'releaseName' in perspective
}

const DEFAULT_PERSPECTIVE = 'drafts'

// Cache for options
const optionsCache = new Map<string, Map<string, PerspectiveHandle>>()

const selectInstancePerspective = (context: SelectorContext<ReleasesStoreState>) =>
  context.instance.config.perspective
const selectActiveReleases = (context: SelectorContext<ReleasesStoreState>) =>
  context.state.activeReleases
const selectOptions = (
  _context: SelectorContext<ReleasesStoreState>,
  options?: PerspectiveHandle,
) => options

const memoizedOptionsSelector = createSelector(
  [selectActiveReleases, selectOptions],
  (activeReleases, options) => {
    if (!options || !activeReleases) return options

    // Use release document IDs as the cache key
    const releaseIds = activeReleases.map((release) => release._id).join(',')
    let nestedCache = optionsCache.get(releaseIds)
    if (!nestedCache) {
      nestedCache = new Map<string, PerspectiveHandle>()
      optionsCache.set(releaseIds, nestedCache)
    }

    const optionsKey = JSON.stringify(options)
    let cachedOptions = nestedCache.get(optionsKey)

    if (!cachedOptions) {
      cachedOptions = options
      nestedCache.set(optionsKey, cachedOptions)
    }
    return cachedOptions
  },
)

/**
 * Provides a subscribable state source for a "perspective" for the Sanity client,
 * which is used to fetch documents as though certain Content Releases are active.
 *
 * @param instance - The Sanity instance to get the perspective for
 * @param options - The options for the perspective -- usually a release name
 *
 * @returns A subscribable perspective value, usually a list of applicable release names,
 * or a single release name / default perspective (such as 'drafts').
 *
 * @public
 */
export const getPerspectiveState = bindActionByDataset(
  releasesStore,
  createStateSourceAction({
    selector: createSelector(
      [selectInstancePerspective, selectActiveReleases, memoizedOptionsSelector],
      (instancePerspective, activeReleases, memoizedOptions) => {
        const perspective =
          memoizedOptions?.perspective ?? instancePerspective ?? DEFAULT_PERSPECTIVE

        if (!isReleasePerspective(perspective)) return perspective

        // if there are no active releases we can't compute the release perspective
        if (!activeReleases || activeReleases.length === 0) return undefined

        const releaseNames = sortReleases(activeReleases).map((release) => release.name)
        const index = releaseNames.findIndex((name) => name === perspective.releaseName)

        if (index < 0) {
          throw new Error(`Release "${perspective.releaseName}" not found in active releases`)
        }

        const filteredReleases = releaseNames.slice(0, index + 1) // Include the release itself

        return ['drafts', ...filteredReleases].filter(
          (name) => !perspective.excludedPerspectives?.includes(name),
        )
      },
    ),
  }),
)
