import {type CollaborationCommentsListenOptions} from '@sanity/client'

/**
 * Data API version used for reading and writing comments. The collaboration
 * API only serves `vX` while it's experimental; switch to a dated version once
 * the API commits to one.
 */
export const COMMENTS_API_VERSION = 'vX'

/**
 * How long a comment list outlives its last subscriber before being dropped.
 *
 * Long enough that navigating away from a document and straight back reuses the
 * loaded list instead of refetching and re-suspending.
 */
export const COMMENTS_STATE_CLEAR_DELAY = 5000

/**
 * `includeResult` is what lets a mutation event carry the changed comment, which
 * is what makes per-comment reconciliation possible rather than refetching the
 * list. `welcome` drives the initial snapshot and `reconnect` restarts it.
 */
export const LISTEN_OPTIONS: CollaborationCommentsListenOptions = {
  events: ['welcome', 'mutation', 'reconnect'],
  includeResult: true,
  visibility: 'query',
  tag: 'comments.listen',
}

/** The comment store holds more than comments, so every query says so. */
const TYPE_FILTER = '_type == "sanity.comment"'

/**
 * Comments on a document, whichever variant of it they were written against.
 *
 * `target.document._ref` is a global document reference built from the published
 * id, so it is the one filter that spans a document's draft, published, and
 * release variants.
 */
const TARGET_FILTER = 'target.document._ref == $targetRef'

/** Comments written against one precise document id. */
const SOURCE_FILTER = 'target.sourceDocumentId == $sourceDocumentId'

/**
 * Everything that is not a release: a draft id and a published id both fail the
 * prefix test, which is what pools them into one list.
 */
const NO_VERSION_FILTER = '!string::startsWith(target.sourceDocumentId, "versions.")'

/** A GROQ filter over comment documents, and the parameters it reads. */
export interface CommentsQuery {
  filter: string
  params: Record<string, string>
}

/**
 * Which of a document's variants a query covers, once a caller's `variants`
 * choice has been read against the perspective and document id in play.
 *
 * @internal
 */
export type CommentsScope =
  /** Only comments written against this exact id, release or otherwise. */
  | {type: 'exact'; sourceDocumentId: string}
  /** Draft and published pooled together, releases left out. */
  | {type: 'no-versions'}
  /** Every comment on the document. */
  | {type: 'any'}

/**
 * The filter for one document's comments.
 *
 * @internal
 */
export function buildDocumentCommentsQuery(targetRef: string, scope: CommentsScope): CommentsQuery {
  if (scope.type === 'exact') {
    return {
      filter: [TYPE_FILTER, TARGET_FILTER, SOURCE_FILTER].join(' && '),
      params: {targetRef, sourceDocumentId: scope.sourceDocumentId},
    }
  }

  const filters = [TYPE_FILTER, TARGET_FILTER]
  if (scope.type === 'no-versions') filters.push(NO_VERSION_FILTER)

  return {filter: filters.join(' && '), params: {targetRef}}
}

/**
 * A caller's own filter, still constrained to comments.
 *
 * @internal
 */
export function buildCommentsQueryFilter(filter: string): string {
  return `${TYPE_FILTER} && (${filter})`
}

/** The snapshot query. Newest comment first. */
export function buildSnapshotQuery(filter: string): string {
  return `*[${filter}] | order(_createdAt desc)`
}

/**
 * The listener query. Unprojected and unordered, as a listener filter must be:
 * mutation events carry the whole comment anyway.
 */
export function buildListenQuery(filter: string): string {
  return `*[${filter}]`
}
