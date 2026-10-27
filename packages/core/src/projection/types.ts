/**
 * @public
 * The result of a projection query
 */
export interface ProjectionValuePending<TValue extends object> {
  /** The projected fields, plus the `_status` the projection store adds to every result */
  data: (TValue & {_status?: DocumentStatus}) | null
  isPending: boolean
}

export interface DocumentProjectionValues<TValue extends object = object> {
  [projectionHash: string]: ProjectionValuePending<TValue>
}

export interface DocumentProjections {
  [projectionHash: string]: string
}

interface DocumentProjectionSubscriptions {
  [projectionHash: string]: {
    [subscriptionId: string]: true
  }
}

/**
 * @public
 * When each version of a document was last edited, as returned in `_status` on projection results
 */
export interface DocumentStatus {
  /** The `_updatedAt` of the draft, if one exists */
  lastEditedDraftAt?: string
  /** The `_updatedAt` of the published document, if one exists */
  lastEditedPublishedAt?: string
  /** The `_updatedAt` of the version in the current release perspective, if one exists */
  lastEditedVersionAt?: string
}
export interface ProjectionStoreState<TValue extends object = Record<string, unknown>> {
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
