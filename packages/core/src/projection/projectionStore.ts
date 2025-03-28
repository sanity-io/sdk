import {defineStore} from '../store/defineStore'
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

/**
 * @beta
 */
export interface ProjectionValuePending<TValue extends object> {
  data: TValue | null
  isPending: boolean
}

export interface ProjectionStoreState<TValue extends object = object> {
  values: {[TDocumentId in string]?: ProjectionValuePending<TValue>}
  documentProjections: {[TDocumentId in string]?: ValidProjection}
  subscriptions: {[TDocumentId in string]?: {[TSubscriptionId in string]?: true}}
}

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
