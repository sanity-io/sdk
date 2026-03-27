import {type DocumentStatus} from '../projection/types'

/**
 *
 * @internal
 */
export interface PreviewQueryResult {
  _id: string
  _type: string
  _updatedAt: string
  titleCandidates: Record<string, unknown>
  subtitleCandidates: Record<string, unknown>
  media?: PreviewMedia | null
  _status?: DocumentStatus
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
  _status?: DocumentStatus
}
