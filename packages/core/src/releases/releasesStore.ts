import {type SanityDocument} from '@sanity/types'
import {map} from 'rxjs'

import {type DocumentSource, isDatasetSource} from '../config/sanityConfig'
/*
 * Although this is an import dependency cycle, it is not a logical cycle:
 * 1. releasesStore uses queryStore as a data source
 * 2. queryStore calls getPerspectiveState for computing release perspectives
 * 3. getPerspectiveState uses releasesStore as a data source
 * 4. however, queryStore does not use getPerspectiveState for the perspective used in releasesStore ("raw")
 */
// eslint-disable-next-line import/no-cycle
import {getQueryState} from '../query/queryStore'
import {bindActionBySource, type BoundSourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {createStateSourceAction, type StateSource} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {sortReleases} from './utils/sortReleases'

const ARCHIVED_RELEASE_STATES = ['archived', 'published']
const STABLE_EMPTY_RELEASES: ReleaseDocument[] = []

/**
 * Represents a document in a Sanity dataset that represents release options.
 * @internal
 */
export type ReleaseDocument = SanityDocument & {
  name: string
  publishAt?: string
  state: 'active' | 'scheduled'
  metadata: {
    title: string
    releaseType: 'asap' | 'scheduled' | 'undecided'
    intendedPublishAt?: string
    description?: string
  }
}

export interface ReleasesStoreState {
  activeReleases?: ReleaseDocument[]
  error?: unknown
}

export const releasesStore = defineStore<ReleasesStoreState, BoundSourceKey>({
  name: 'Releases',
  getInitialState: (): ReleasesStoreState => ({
    activeReleases: undefined,
  }),
  initialize: (context) => {
    const subscription = subscribeToReleases(context)
    return () => subscription.unsubscribe()
  },
})

/**
 * Get the active releases from the store.
 * @internal
 */
const _getActiveReleasesState = bindActionBySource(
  releasesStore,
  createStateSourceAction({
    selector: ({state}, _?) => state.activeReleases,
  }),
)

/**
 * Get the active releases from the store.
 * @internal
 */
export const getActiveReleasesState = (
  instance: SanityInstance,
  options?: {source?: DocumentSource},
): StateSource<ReleaseDocument[] | undefined> =>
  // bindActionBySource keyFn destructures { source } from the first param, so pass {} when no options
  _getActiveReleasesState(instance, options ?? {})

const RELEASES_QUERY = 'releases::all()'

const subscribeToReleases = ({
  instance,
  state,
  key: {source},
}: StoreContext<ReleasesStoreState, BoundSourceKey>) => {
  const {observable: releases$} = getQueryState<ReleaseDocument[]>(instance, {
    query: RELEASES_QUERY,
    perspective: 'raw',
    source: source && !isDatasetSource(source) ? source : undefined,
    tag: 'releases',
  })
  return releases$
    .pipe(
      map((releases) => {
        // logic here mirrors that of studio:
        // https://github.com/sanity-io/sanity/blob/156e8fa482703d99219f08da7bacb384517f1513/packages/sanity/src/core/releases/store/useActiveReleases.ts#L29
        state.set('setActiveReleases', {
          activeReleases: sortReleases(releases ?? STABLE_EMPTY_RELEASES)
            .filter((release) => !ARCHIVED_RELEASE_STATES.includes(release.state))
            .reverse(),
        })
      }),
    )
    .subscribe({error: (error) => state.set('setError', {error})})
}
