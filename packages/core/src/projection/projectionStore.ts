import {type BoundDatasetKey} from '../store/createActionBinder'
import {defineStore} from '../store/defineStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {type ProjectionStoreState} from './types'

export const projectionStore = defineStore<ProjectionStoreState, BoundDatasetKey>({
  name: 'Projection',
  getInitialState() {
    return {
      values: {},
      documentProjections: {},
      subscriptions: {},
    }
  },
  initialize(context) {
    const batchSubscription = subscribeToStateAndFetchBatches(context)
    return () => batchSubscription.unsubscribe()
  },
})
