/**
 * @public
 * The result of a projection query
 */
export interface ProjectionValuePending<TValue extends object> {
  data: TValue | null
  isPending: boolean
}

export interface DocumentProjectionValues<TValue extends object = object> {
  [projectionHash: string]: ProjectionValuePending<TValue>
}

/**
 * @public
 * @deprecated
 * Template literals are a bit too limited, so this type is deprecated.
 * Use `string` instead. Projection strings are validated at runtime.
 */
export type ValidProjection = string

export interface DocumentProjections {
  [projectionHash: string]: string
}

interface DocumentProjectionSubscriptions {
  [projectionHash: string]: {
    [subscriptionId: string]: true
  }
}

interface DocumentStatus {
  lastEditedDraftAt?: string
  lastEditedPublishedAt?: string
  lastEditedVersionAt?: string
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

  /**
   * A map of document IDs to their status information (same shape as _status returned to users)
   */
  documentStatuses: {
    [documentId: string]: DocumentStatus
  }
}
