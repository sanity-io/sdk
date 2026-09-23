import {type ReleaseDocument} from '@sanity/client'
import {map, Subscription} from 'rxjs'

import {type DocumentResource} from '../config/sanityConfig'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {createStateSourceAction, type StateSource} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {observeReleases} from './observeReleases'
import {sortReleases} from './utils/sortReleases'

const ARCHIVED_RELEASE_STATES = ['archived', 'published']
const STABLE_EMPTY_RELEASES: ReleaseDocument[] = []

/**
 * Lifecycle states a release document can be in. Mirrors the server's
 * `ReleaseState`.
 * @beta
 */
export type ReleaseState =
  | 'active'
  | 'archiving'
  | 'unarchiving'
  | 'archived'
  | 'published'
  | 'publishing'
  | 'scheduled'
  | 'scheduling'

export interface ReleasesStoreState {
  activeReleases?: ReleaseDocument[]
  allReleases?: ReleaseDocument[]
  error?: unknown
}

export const releasesStore = defineStore<ReleasesStoreState, BoundResourceKey>({
  name: 'Releases',
  // Empty rather than undefined, so the React hooks do not suspend on first load. A
  // reconnect keeps whatever was last known until the fetch returns.
  getInitialState: (): ReleasesStoreState => ({
    activeReleases: STABLE_EMPTY_RELEASES,
    allReleases: STABLE_EMPTY_RELEASES,
  }),
  upstream: (context) => subscribeToReleases(context),
})

/**
 * Get the active releases from the store.
 * @internal
 */
const _getActiveReleasesState = bindActionByResource(
  releasesStore,
  createStateSourceAction({
    selector: ({state}) => {
      if (state.error) throw state.error
      return state.activeReleases
    },
  }),
)

/**
 * Get the active releases from the store.
 * @internal
 */
export const getActiveReleasesState = (
  instance: SanityInstance,
  options?: {resource?: DocumentResource},
): StateSource<ReleaseDocument[] | undefined> =>
  // bindActionByResource keyFn destructures { resource } from the first param, so pass {} when no options
  _getActiveReleasesState(instance, options ?? {})

/**
 * Get every release in the store, including archived and published.
 * @internal
 */
const _getAllReleasesState = bindActionByResource(
  releasesStore,
  createStateSourceAction({
    selector: ({state}) => {
      if (state.error) throw state.error
      return state.allReleases
    },
  }),
)

/**
 * Get every release in the store, including archived and published.
 * @internal
 */
export const getAllReleasesState = (
  instance: SanityInstance,
  options?: {resource?: DocumentResource},
): StateSource<ReleaseDocument[] | undefined> => _getAllReleasesState(instance, options ?? {})

const subscribeToReleases = ({
  instance,
  state,
  key: {resource},
}: StoreContext<ReleasesStoreState, BoundResourceKey>) => {
  const releases$ = observeReleases(instance, {
    resource,
    // Surface listener and fetch errors while allowing later updates to recover.
    onError: (error) => state.set('setError', {error}),
  })
  // Clear an upstream failure when demand closes so a later mount can retry.
  const subscription = new Subscription(() => state.set('clearError', {error: undefined}))
  subscription.add(
    releases$
      .pipe(
        map((releases) => {
          // logic here mirrors that of studio:
          // https://github.com/sanity-io/sanity/blob/156e8fa482703d99219f08da7bacb384517f1513/packages/sanity/src/core/releases/store/useActiveReleases.ts#L29
          const sorted = sortReleases(releases ?? STABLE_EMPTY_RELEASES).reverse()
          state.set('setReleases', {
            error: undefined,
            allReleases: sorted,
            activeReleases: sorted.filter(
              (release) => !ARCHIVED_RELEASE_STATES.includes(release.state),
            ),
          })
        }),
      )
      // Client-state errors are surfaced here; listener and fetch errors are handled above.
      .subscribe({error: (error) => state.set('setError', {error})}),
  )
  return subscription
}
