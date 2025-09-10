import {type PerspectiveHandle} from '../config/sanityConfig'
import {defineStore} from '../store/defineStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {type ProjectionStoreState} from './types'

export const projectionStore = defineStore<ProjectionStoreState, PerspectiveHandle>({
  name: 'Projection',
  getInitialState(_instance, handle) {
    return {
      values: {},
      documentProjections: {},
      subscriptions: {},
      perspective: handle.perspective ?? 'drafts',
    }
  },
  initialize(context) {
    const batchSubscription = subscribeToStateAndFetchBatches(context)
    return () => batchSubscription.unsubscribe()
  },
})
