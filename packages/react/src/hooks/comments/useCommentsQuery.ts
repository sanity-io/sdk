import {
  type Comment,
  type CommentsQueryOptions,
  getCommentsQueryState,
  resolveCommentsQuery,
} from '@sanity/sdk'
import {getCommentsQueryOptionsKey, parseCommentsQueryOptionsKey} from '@sanity/sdk/_internal'
import {useMemo} from 'react'

import {type WithResourceNameSupport} from '../helpers/useNormalizedResourceOptions'
import {type CommentListSource, useCommentList} from './useCommentList'

/**
 * @public
 * @category Types
 */
export interface UseCommentsQueryResult {
  /** Every matching comment, newest first, replies included. */
  comments: Comment[]
  /** True while switching to a different filter. */
  isPending: boolean
}

const SOURCE: CommentListSource<CommentsQueryOptions, Comment[]> = {
  getState: getCommentsQueryState,
  resolve: resolveCommentsQuery,
  getKey: getCommentsQueryOptionsKey,
  parseKey: parseCommentsQueryOptionsKey,
}

/**
 * Reads comments matching a GROQ filter and keeps them up to date.
 *
 * The escape hatch for anything that is not "comments on this document":
 * cross-document views, per-user views, organization-wide activity. The list is
 * flat, replies included; reach for {@link useDocumentComments} to read one
 * document's comments grouped into threads.
 *
 * `_type == "sanity.comment"` is applied for you. Comments are stored per
 * organization, so `collaboration.organizationId` has to be configured — on the
 * Sanity config, or per call.
 *
 * Suspends until the comments have loaded. Switching filter is a transition, so
 * the previous list stays on screen and `isPending` goes true rather than the
 * component suspending again.
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
 * @public
 */
export function useCommentsQuery(
  options: WithResourceNameSupport<CommentsQueryOptions>,
): UseCommentsQueryResult {
  const {value, isPending} = useCommentList('useCommentsQuery', options, SOURCE)
  return useMemo(() => ({comments: value, isPending}), [isPending, value])
}
