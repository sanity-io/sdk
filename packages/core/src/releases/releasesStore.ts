import {type SanityDocument} from '@sanity/types'
import {createSelector} from 'reselect'
import {catchError, EMPTY, tap} from 'rxjs'

import {type PerspectiveHandle, type ReleasePerspective} from '../config/sanityConfig'
import {getQueryState} from '../query/queryStore'
import {bindActionByDataset} from '../store/createActionBinder'
import {createStateSourceAction, type SelectorContext} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'

function isReleasePerspective(
  perspective: PerspectiveHandle['perspective'],
): perspective is ReleasePerspective {
  return typeof perspective === 'object' && perspective !== null && 'releaseName' in perspective
}

const DEFAULT_PERSPECTIVE = 'drafts'

type ReleaseDocument = SanityDocument & {
  name: string
  metadata: {
    releaseType: 'asap' | 'scheduled' | 'undecided'
  }
}

interface ReleasesStoreState {
  activeReleases?: ReleaseDocument[]
  error?: unknown
}

const releasesStore = defineStore<ReleasesStoreState>({
  name: 'Releases',
  getInitialState: (): ReleasesStoreState => ({
    activeReleases: undefined,
  }),
  initialize: (context) => {
    const subscription = subscribeToReleases(context)
    return () => subscription.unsubscribe()
  },
})

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

export const getActiveReleasesState = bindActionByDataset(
  releasesStore,
  createStateSourceAction({
    selector: ({state}) => state.activeReleases,
  }),
)

const subscribeToReleases = ({instance, state}: StoreContext<ReleasesStoreState>) => {
  return getQueryState<ReleaseDocument[]>(instance, 'releases::all()[state == "active"]')
    .observable.pipe(
      tap((result) => {
        if (result !== undefined) {
          // TODO: sort these releases
          state.set('setActiveReleases', {activeReleases: result})
        }
      }),
      catchError((error) => {
        state.set('setError', {error})
        return EMPTY
      }),
    )
    .subscribe()
}
