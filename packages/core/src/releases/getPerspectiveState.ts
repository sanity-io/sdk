import {createSelector} from 'reselect'

import {type PerspectiveHandle, type ReleasePerspective} from '../config/sanityConfig'
import {bindActionByDataset} from '../store/createActionBinder'
import {createStateSourceAction, type SelectorContext} from '../store/createStateSourceAction'
import {type ReleaseDocument, releasesStore, type ReleasesStoreState} from './releasesStore'

function isReleasePerspective(
  perspective: PerspectiveHandle['perspective'],
): perspective is ReleasePerspective {
  return typeof perspective === 'object' && perspective !== null && 'releaseName' in perspective
}

const DEFAULT_PERSPECTIVE = 'drafts'

// Cache for options
const optionsCache = new WeakMap<ReleaseDocument[], Map<string, PerspectiveHandle>>()

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

    let nestedCache = optionsCache.get(activeReleases)
    if (!nestedCache) {
      nestedCache = new Map<string, PerspectiveHandle>()
      optionsCache.set(activeReleases, nestedCache)
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
        if (!activeReleases) return undefined

        const releaseNames = activeReleases.map((release) => release.name)
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
