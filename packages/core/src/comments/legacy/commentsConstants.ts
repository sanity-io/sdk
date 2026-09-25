import {type ListenOptions} from '@sanity/client'

/** Data API version used for reading and writing comments in the addon dataset. */
export const COMMENTS_API_VERSION = 'v2025-05-06'

/** Projects API version used to discover and provision the addon dataset. */
export const ADDON_DATASET_API_VERSION = 'v2025-02-19'

/**
 * The dataset profile the Studio tags its comments dataset with. Discovery
 * matches on it, so changing it stops the SDK and the Studio sharing comments.
 */
export const ADDON_DATASET_PROFILE = 'comments'

/**
 * How long a comment list outlives its last subscriber before being dropped.
 *
 * Long enough that navigating away from a document and straight back reuses the
 * loaded list instead of refetching and re-suspending.
 */
export const COMMENTS_STATE_CLEAR_DELAY = 5000

/**
 * Kept identical to the Studio's own listener options
 * (`packages/sanity/src/core/comments/store/useCommentsStore.ts:29-35`), apart
 * from the request tag. `includeResult` is what lets a mutation event carry the
 * changed comment, which is what makes per-comment reconciliation possible
 * rather than refetching the list.
 */
export const LISTEN_OPTIONS: ListenOptions = {
  events: ['welcome', 'mutation', 'reconnect'],
  includeResult: true,
  includeAllVersions: true,
  visibility: 'query',
  tag: 'comments.listen',
}

const QUERY_PROJECTION = `{
  _createdAt,
  _id,
  _rev,
  authorId,
  contentSnapshot,
  context,
  lastEditedAt,
  message,
  parentCommentId,
  reactions,
  status,
  target,
  threadId
}`

const BASE_FILTERS = [`_type == "comment"`, `target.document._ref == $documentId`]
const VERSION_FILTER = `target.documentVersionId == $documentVersionId`
const NO_VERSION_FILTER = `!defined(target.documentVersionId)`

/**
 * Which comments belong to a document, matching the Studio's filter.
 *
 * A release's comments are kept apart from the default ones: asking for a
 * release returns only that release's comments, and asking without one returns
 * only comments with no version at all.
 */
function buildCommentsFilter(documentVersionId?: string): string {
  return [...BASE_FILTERS, documentVersionId ? VERSION_FILTER : NO_VERSION_FILTER].join(' && ')
}

/** The snapshot query. Newest comment first, as the Studio orders it. */
export function buildCommentsQuery(documentVersionId?: string): string {
  return `*[${buildCommentsFilter(documentVersionId)}] ${QUERY_PROJECTION} | order(_createdAt desc)`
}

/**
 * The listener query. Unprojected on purpose: mutation events carry the whole
 * comment, so there is nothing to trim.
 */
export function buildCommentsListenQuery(documentVersionId?: string): string {
  return `*[${buildCommentsFilter(documentVersionId)}]`
}
