import {type ValidProjection} from './projectionStore'

export interface ProjectionValuePending<TValue extends object> {
  data: TValue | null
  isPending: boolean
}

export interface DocumentProjectionValues<TValue extends object = object> {
  [projectionHash: string]: ProjectionValuePending<TValue>
}

export interface DocumentProjections {
  [projectionHash: string]: ValidProjection
}

export interface DocumentProjectionSubscriptions {
  [projectionHash: string]: {
    [subscriptionId: string]: true
  }
}

export interface ProjectionStoreState<TValue extends object = object> {
  /**
   * A map of document IDs to their projection values, organized by projection hash
   */
  values: {
    [documentId: string]: DocumentProjectionValues<TValue>
  }

  /**
   * A map of document IDs to their projections, organized by projection hash
   */
  documentProjections: {
    [documentId: string]: DocumentProjections
  }

  /**
   * A map of document IDs to their subscriptions, organized by projection hash
   */
  subscriptions: {
    [documentId: string]: DocumentProjectionSubscriptions
  }
}
