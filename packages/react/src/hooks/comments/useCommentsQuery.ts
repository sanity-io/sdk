import {getCommentsQueryOptionsKey, parseCommentsQueryOptionsKey} from '@sanity/sdk/_internal'
import {
  type Comment,
  type CommentsQueryOptions,
  getCommentsQueryErrorState,
  getCommentsQueryState,
  resolveCommentsQuery,
} from '@sanity/sdk/collaboration'
import {useMemo} from 'react'

import {type WithResourceNameSupport} from '../helpers/useNormalizedResourceOptions'
import {type CommentListSource, useCommentList} from './useCommentList'

/**
 * @beta
 * @category Types
 */
export interface UseCommentsQueryResult {
  /** Every matching comment, newest first, replies included. */
  comments: Comment[]
  /** True while switching to a different filter. */
  isPending: boolean
  /**
   * Set when the comments have stopped following the server: the listener
   * failed after they had loaded, so what you are reading is the list as it
   * last stood rather than as it is. Clears when a listener comes back.
   */
  error?: unknown
}

const SOURCE: CommentListSource<CommentsQueryOptions, Comment[]> = {
  getState: getCommentsQueryState,
  getErrorState: getCommentsQueryErrorState,
  resolve: resolveCommentsQuery,
  getKey: getCommentsQueryOptionsKey,
  parseKey: parseCommentsQueryOptionsKey,
}

/**
 * Reads comments matching a GROQ filter and keeps them up to date.
 *
 * The escape hatch for anything that is not "comments on this document":
 * cross-document views, per-user views, organization-wide activity. The list is
 * flat, replies included; reach for {@link useCommentThreads} to read one
 * document's comments grouped into threads.
 *
 * `_type == "sanity.comment"` is applied for you. Comments are stored per
 * organization, resolved rather than configured: the one the Dashboard opened
 * the app in, else `organizationId` on the Sanity config, else the organization
 * owning the resource's project. The filter runs over every comment that
 * organization can read, not only the ones in the resource's dataset: comment
 * queries are routed by organization and the resource is not sent with them.
 * To keep to one dataset, add a `target.document._ref` prefix condition
 * yourself. Refs are `dataset:{projectId}.{dataset}:{documentId}`.
 *
 * Suspends until the comments have loaded. Switching filter is a transition, so
 * the previous list stays on screen and `isPending` goes true rather than the
 * component suspending again.
 *
 * Writes show here before the server confirms them, the same as they do on a
 * document's comments, because the filter is matched against the written
 * comment locally. That holds for writes through the resource the query is
 * bound to; comments written through another dataset arrive once the server
 * confirms them. A filter that cannot be answered that way — one that
 * dereferences, runs a `*[...]` of its own, or calls a context-dependent
 * function such as `sanity::dataset()` or `now()` — still works, but only
 * follows the server, and costs a connection of its own rather than sharing one.
 *
 * @category Comments
 * @function
 * @param options - The GROQ `filter` to match, and any `params` it reads
 * @returns The matching comments, and whether a switch is in flight
 *
 * @example Every comment mentioning the current user
 * ```tsx
 * function Mentions({userId}: {userId: string}) {
 *   const {comments} = useCommentsQuery({
 *     filter: 'count(message[].children[_type == "mention" && userId == $userId]) > 0',
 *     params: {userId},
 *   })
 *
 *   return <span>{comments.length}</span>
 * }
 * ```
 *
 * @example Open comments in one dataset
 * ```tsx
 * function OpenInProduction() {
 *   const {comments} = useCommentsQuery({
 *     filter: 'string::startsWith(target.document._ref, $prefix) && status == "open"',
 *     params: {prefix: 'dataset:abc123.production:'},
 *   })
 *
 *   return <span>{comments.length}</span>
 * }
 * ```
 *
 * @beta
 */
export function useCommentsQuery(
  options: WithResourceNameSupport<CommentsQueryOptions>,
): UseCommentsQueryResult {
  const {value, isPending, error} = useCommentList('useCommentsQuery', options, SOURCE)
  return useMemo(() => ({comments: value, isPending, error}), [error, isPending, value])
}
