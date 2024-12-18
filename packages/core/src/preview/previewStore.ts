import type {SyncTag} from '@sanity/client'

import {createResource} from '../resources/createResource'
import {subscribeToLiveAndSetLastLiveEventId} from './subscribeToLiveAndSetLastLiveEventId'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

export interface PreviewQueryResult {
  _id: string
  _type: string
  _updatedAt: string
  select: Record<string, unknown>
}

/**
 * Represents the set of values displayed as a preview for a given Sanity document.
 * This includes a primary title, a secondary subtitle, and optional media associated
 * with the document.
 *
 * @public
 */
export interface PreviewValue {
  /**
   * The primary text displayed for the document preview.
   */
  title: string

  /**
   * A secondary line of text providing additional context about the document.
   */
  subtitle?: string

  /**
   * An optional media object, commonly representing an image, that is associated
   * with the document and displayed as part of the preview.
   */
  media?: {type: 'image-asset'; url: string} | null

  status?: {
    lastEditedPublishedAt?: string
    lastEditedDraftAt?: string
  }
}

/**
 * Represents the current state of a preview value along with a flag indicating whether
 * the preview data is still being fetched or is fully resolved.
 *
 * The tuple contains a preview value or null, and a boolean indicating if the data is
 * pending. A `true` value means a fetch is ongoing; `false` indicates that the
 * currently provided preview value is up-to-date.
 *
 * @public
 */
export type ValuePending<T> = [T | null, boolean]

/**
 * @public
 */
export interface PreviewStoreState {
  values: {[TDocumentId in string]?: ValuePending<PreviewValue>}
  documentTypes: {[TDocumentId in string]?: string}
  subscriptions: {[TDocumentId in string]?: {[TSubscriptionId in string]?: true}}
  syncTags: Record<SyncTag, true>
  lastLiveEventId: string | null
}

export const previewStore = createResource<PreviewStoreState>({
  name: 'Preview',
  getInitialState() {
    return {
      documentTypes: {},
      lastLiveEventId: null,
      subscriptions: {},
      syncTags: {},
      values: {},
    }
  },
  initialize() {
    const stateSubscriptionForBatches = subscribeToStateAndFetchBatches(this)
    const liveSubscription = subscribeToLiveAndSetLastLiveEventId(this)

    return () => {
      stateSubscriptionForBatches.unsubscribe()
      liveSubscription.unsubscribe()
    }
  },
})
