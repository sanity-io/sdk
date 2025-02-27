import {createLiveEventSubscriber} from '../common/createLiveEventSubscriber'
import {type LiveEventAwareState} from '../common/types'
import {createResource} from '../resources/createResource'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {PROJECTION_TAG} from './util'

export interface ProjectionQueryResult<TValue = Record<string, unknown>> {
  _id: string
  _type: string
  _updatedAt: string
  result: TValue
}

/**
 * @beta
 */
export interface ProjectionValuePending<TValue> {
  results: TValue | null
  isPending: boolean
}

export interface ProjectionStoreState<TValue = Record<string, unknown>>
  extends LiveEventAwareState {
  values: {[TDocumentId in string]?: ProjectionValuePending<TValue>}
  documentProjections: {[TDocumentId in string]?: string}
  subscriptions: {[TDocumentId in string]?: {[TSubscriptionId in string]?: true}}
}

export const projectionStore = createResource<ProjectionStoreState>({
  name: 'Projection',
  getInitialState() {
    return {
      values: {},
      documentProjections: {},
      subscriptions: {},
      syncTags: {},
      lastLiveEventId: null,
    }
  },
  initialize() {
    const subscribeToLiveAndSetLastLiveEventId =
      createLiveEventSubscriber<ProjectionStoreState>(PROJECTION_TAG)
    const liveSubscription = subscribeToLiveAndSetLastLiveEventId(this)
    const batchSubscription = subscribeToStateAndFetchBatches(this)

    return () => {
      liveSubscription.unsubscribe()
      batchSubscription.unsubscribe()
    }
  },
})
