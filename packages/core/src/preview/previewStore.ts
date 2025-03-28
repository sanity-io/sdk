import {defineStore} from '../store/defineStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

export interface PreviewQueryResult {
  _id: string
  _type: string
  _updatedAt: string
  titleCandidates: Record<string, unknown>
  subtitleCandidates: Record<string, unknown>
  media?: PreviewMedia | null
}

/**
 * Represents a media asset in a preview.
 *
 * @public
 */
export interface PreviewMedia {
  type: 'image-asset'
  _ref: string
  url: string
}

/**
 * Represents the set of values displayed as a preview for a given Sanity document.
 * This includes a primary title, a secondary subtitle, an optional piece of media associated
 * with the document, and the document's status.
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
   * An optional piece of media representing the document within its preview.
   * Currently, only image assets are available.
   */
  media?: PreviewMedia | null

  /**
   * The status of the document.
   */
  status?: {
    /** The date of the last published edit */
    lastEditedPublishedAt?: string
    /** The date of the last draft edit */
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
export type ValuePending<T> = {
  data: T | null
  isPending: boolean
}

/**
 * @public
 */
export interface PreviewStoreState {
  values: {[TDocumentId in string]?: ValuePending<PreviewValue>}
  subscriptions: {[TDocumentId in string]?: {[TSubscriptionId in string]?: true}}
}

export const previewStore = defineStore<PreviewStoreState>({
  name: 'Preview',
  getInitialState() {
    return {
      subscriptions: {},
      values: {},
    }
  },
  initialize: (context) => {
    const subscription = subscribeToStateAndFetchBatches(context)
    return () => subscription.unsubscribe
  },
})
