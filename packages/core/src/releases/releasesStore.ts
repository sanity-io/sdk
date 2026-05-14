import {type SanityDocument} from '@sanity/types'
import {map} from 'rxjs'

import {type DocumentResource} from '../config/sanityConfig'
/*
 * Although this is an import dependency cycle, it is not a logical cycle:
 * 1. releasesStore uses queryStore as a data source
 * 2. queryStore calls getPerspectiveState for computing release perspectives
 * 3. getPerspectiveState uses releasesStore as a data source
 * 4. however, queryStore does not use getPerspectiveState for the perspective used in releasesStore ("raw")
 */
// eslint-disable-next-line import/no-cycle
import {getQueryState} from '../query/queryStore'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {createStateSourceAction, type StateSource} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
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

/**
 * Represents a release document (`_.releases.<name>`) in a Sanity dataset.
 * The shape mirrors the server-side release document and is wider than the
 * subset surfaced through `getActiveReleasesState` (which filters to active
 * releases only).
 * @beta
 */
export type ReleaseDocument = SanityDocument & {
  _type: 'system.release'
  name: string
  state: ReleaseState
  /**
   * Server-set time at which a scheduled release will be published. Takes
   * precedence over `metadata.intendedPublishAt`.
   */
  publishAt?: string
  /**
   * Server-set time at which the release was actually published.
   */
  publishedAt?: string
  /**
   * Populated when a release transition fails on the server.
   */
  error?: {message: string}
  /**
   * Populated for `published` releases — captures the final IDs of documents
   * the release published.
   */
  finalDocumentStates?: {id: string}[]
  metadata: {
    title?: string
    description?: string
    intendedPublishAt?: string
    releaseType: 'asap' | 'scheduled' | 'undecided'
    cardinality?: 'one' | 'many'
  }
}

export interface ReleasesStoreState {
  activeReleases?: ReleaseDocument[]
  allReleases?: ReleaseDocument[]
  error?: unknown
}

export const releasesStore = defineStore<ReleasesStoreState, BoundResourceKey>({
  name: 'Releases',
  getInitialState: (): ReleasesStoreState => ({
    activeReleases: undefined,
    allReleases: undefined,
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
const _getActiveReleasesState = bindActionByResource(
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
    selector: ({state}, _?) => state.allReleases,
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

const RELEASES_QUERY = 'releases::all()'

const subscribeToReleases = ({
  instance,
  state,
  key: {resource},
}: StoreContext<ReleasesStoreState, BoundResourceKey>) => {
  const {observable: releases$} = getQueryState<ReleaseDocument[]>(instance, {
    query: RELEASES_QUERY,
    perspective: 'raw',
    resource,
    tag: 'releases',
  })
  return releases$
    .pipe(
      map((releases) => {
        // logic here mirrors that of studio:
        // https://github.com/sanity-io/sanity/blob/156e8fa482703d99219f08da7bacb384517f1513/packages/sanity/src/core/releases/store/useActiveReleases.ts#L29
        const sorted = sortReleases(releases ?? STABLE_EMPTY_RELEASES).reverse()
        state.set('setReleases', {
          allReleases: sorted,
          activeReleases: sorted.filter(
            (release) => !ARCHIVED_RELEASE_STATES.includes(release.state),
          ),
        })
      }),
    )
    .subscribe({error: (error) => state.set('setError', {error})})
}
