import {type SanityClient} from '@sanity/client'
import {type SanityDocument} from '@sanity/types'
import {catchError, EMPTY, retry, switchMap, timer} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {bindActionByDataset} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {listenQuery} from '../utils/listenQuery'
import {sortReleases} from './utils/sortReleases'

const ARCHIVED_RELEASE_STATES = ['archived', 'published']

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

export const releasesStore = defineStore<ReleasesStoreState>({
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
export const getActiveReleasesState = bindActionByDataset(
  releasesStore,
  createStateSourceAction({
    selector: ({state}) => state.activeReleases,
  }),
)

const RELEASES_QUERY = 'releases::all()'
const QUERY_PARAMS = {}

const subscribeToReleases = ({instance, state}: StoreContext<ReleasesStoreState>) => {
  return getClientState(instance, {
    apiVersion: '2025-04-10',
    perspective: 'raw',
  })
    .observable.pipe(
      switchMap((client: SanityClient) =>
        // releases are system documents, and are not supported by useQueryState
        listenQuery<ReleaseDocument[]>(client, RELEASES_QUERY, QUERY_PARAMS, {
          tag: 'releases-listener',
          throttleTime: 1000,
          transitions: ['update', 'appear', 'disappear'],
        }).pipe(
          retry({
            count: 3,
            delay: (error, retryCount) => {
              // eslint-disable-next-line no-console
              console.error('[releases] Error in subscription:', error, 'Retry count:', retryCount)
              return timer(Math.min(1000 * Math.pow(2, retryCount), 10000))
            },
          }),
          catchError((error) => {
            state.set('setError', {error})
            return EMPTY
          }),
        ),
      ),
    )
    .subscribe({
      next: (releases) => {
        // logic here mirrors that of studio:
        // https://github.com/sanity-io/sanity/blob/156e8fa482703d99219f08da7bacb384517f1513/packages/sanity/src/core/releases/store/useActiveReleases.ts#L29
        state.set('setActiveReleases', {
          activeReleases: sortReleases(releases ?? [])
            .filter((release) => !ARCHIVED_RELEASE_STATES.includes(release.state))
            .reverse(),
        })
      },
    })
}
