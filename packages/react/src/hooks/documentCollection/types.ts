import {type DocumentHandle} from '@sanity/sdk'

/**
 * @public
 * A live collection of {@link DocumentHandle}s, along with metadata about the collection and a function for loading more of them.
 * @category Types
 */
export interface DocumentHandleCollection {
  /** Retrieve more documents matching the provided options */
  loadMore: () => void
  /** The retrieved document handles of the documents matching the provided options */
  results: DocumentHandle[]
  /** Whether a retrieval of documents is in flight */
  isPending: boolean
  /** Whether more documents exist that match the provided options than have been retrieved */
  hasMore: boolean
  /** The total number of documents in the collection */
  count: number
}
