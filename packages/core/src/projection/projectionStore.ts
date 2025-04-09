import {defineStore} from '../store/defineStore'
import {type ProjectionStoreState} from './projectionStoreTypes'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

/**
 * @beta
 */
export type ValidProjection = `{${string}}`

export interface ProjectionQueryResult<TValue = Record<string, unknown>> {
  _id: string
  _type: string
  _updatedAt: string
  result: TValue
}

// Re-export types from projectionStoreTypes
export type {
  DocumentProjections,
  DocumentProjectionSubscriptions,
  DocumentProjectionValues,
  ProjectionStoreState,
  ProjectionValuePending,
} from './projectionStoreTypes'

export const projectionStore = defineStore<ProjectionStoreState>({
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
