import {type SanityDocument} from '@sanity/types'
import {catchError, EMPTY, tap} from 'rxjs'

import {getQueryState} from '../query/queryStore'
import {bindActionByDataset} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'

export type ReleaseDocument = SanityDocument & {
  name: string
  metadata: {
    releaseType: 'asap' | 'scheduled' | 'undecided'
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

export const getActiveReleasesState = bindActionByDataset(
  releasesStore,
  createStateSourceAction({
    selector: ({state}) => state.activeReleases,
  }),
)

const subscribeToReleases = ({instance, state}: StoreContext<ReleasesStoreState>) => {
  return getQueryState<ReleaseDocument[]>(instance, 'releases::all()[state == "active"]', {
    perspective: 'raw',
  })
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
