import {type Subscribable} from 'rxjs'

import type {DocumentHandle} from '../documentList/documentListStore'

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
  subtitle: string

  /**
   * An optional media object, commonly representing an image, that is associated
   * with the document and displayed as part of the preview.
   */
  media: {type: 'image-asset'; url: string} | null
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
 * Options used when subscribing to preview events for a specific document. These events
 * emit whenever the preview value changes, allowing consumers to react to updated data.
 *
 * @public
 */
export interface PreviewEventsOptions {
  /**
   * The document handle for which to subscribe to preview updates.
   */
  document: DocumentHandle
}

/**
 * Options used when resolving the current preview value for a specific document. This
 * can be used to programmatically fetch the document’s preview without subscribing to
 * future updates.
 *
 * @public
 */
export interface ResolvePreviewOptions {
  /**
   * The document handle for which to resolve the current preview value.
   */
  document: DocumentHandle
}

/**
 * Options used to retrieve the current state of a preview for a specific document.
 * This method returns a tuple containing the preview data and whether it’s still pending.
 *
 * @public
 */
export interface GetPreviewOptions {
  /**
   * The document handle for which to retrieve the current preview state.
   */
  document: DocumentHandle
}

/**
 * The preview store interface defines how you interact with the preview system. It
 * provides methods to subscribe to document preview events, resolve the current preview
 * value, retrieve the existing preview state, and manage the preview cache and lifecycle.
 *
 * @public
 */
export interface PreviewStore {
  /**
   * Returns a subscribable stream of preview updates for the specified document. As the
   * preview value changes, new values will be emitted to subscribers.
   */
  events: (options: PreviewEventsOptions) => Subscribable<ValuePending<PreviewValue>>

  /**
   * Resolves and returns the current preview value for the specified document as a
   * Promise. This is useful for on-demand fetching without maintaining a subscription.
   */
  resolvePreview: (options: ResolvePreviewOptions) => Promise<PreviewValue>

  /**
   * Retrieves the current preview value and pending status for the specified document.
   * This returns a tuple containing either the current preview value or null, and a
   * boolean indicating if the data is pending.
   */
  getPreview: (options: GetPreviewOptions) => ValuePending<PreviewValue>

  /**
   * Clears all cached preview values and resets the internal state of the preview store.
   * After clearing the cache, previously fetched previews will need to be refetched.
   */
  clearCache: () => void

  /**
   * Disposes of the preview store and frees all associated resources, including any
   * active subscriptions. Once disposed, the store should no longer be used.
   */
  dispose: () => void
}
