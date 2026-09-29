import {getDocumentCommentsOptionsKey, parseDocumentCommentsOptionsKey} from '@sanity/sdk/_internal'
import {
  type Comment,
  type CommentsOptions,
  getCommentsErrorState,
  getCommentsState,
  resolveComments,
} from '@sanity/sdk/collaboration'
import {useMemo} from 'react'

import {type WithResourceNameSupport} from '../helpers/useNormalizedResourceOptions'
import {type CommentListSource, useCommentList} from './useCommentList'

/**
 * @beta
 * @category Types
 */
export interface UseCommentsResult {
  /** Every matching comment, newest first, replies included. */
  comments: Comment[]
  /** True while switching to a different document or filter. */
  isPending: boolean
  /**
   * Set when the comments have stopped following the server: the listener
   * failed after they had loaded, so what you are reading is the list as it
   * last stood rather than as it is. Clears when a listener comes back.
   */
  error?: unknown
}

const SOURCE: CommentListSource<CommentsOptions, Comment[]> = {
  getState: getCommentsState,
  getErrorState: getCommentsErrorState,
  resolve: resolveComments,
  getKey: getDocumentCommentsOptionsKey,
  parseKey: parseDocumentCommentsOptionsKey,
}

/**
 * Reads a document's comments and keeps them up to date.
 *
 * The list is flat, replies included, which suits a count or a feed. Reach for
 * {@link useCommentThreads} to read the same comments grouped, where a reply
 * sits under the comment it answers and filtering by `status` or `fieldPath`
 * selects whole threads rather than individual comments. Both read the same
 * document and share a listener, so using them side by side costs nothing
 * extra. {@link useCommentsQuery} covers anything that is not one document's
 * comments.
 *
 * Suspends until the comments have loaded. Switching document or filter is a
 * transition, so the previous list stays on screen and `isPending` goes true
 * rather than the component suspending again.
 *
 * @category Comments
 * @function
 * @param options - The document to read, optionally narrowed by `fieldPath`, `status`, or `variants`
 * @returns The matching comments, and whether a switch is in flight
 *
 * @example Count the open comments on a field
 * ```tsx
 * function TitleCommentCount({documentId}: {documentId: string}) {
 *   const {comments} = useComments({
 *     documentId,
 *     documentType: 'article',
 *     fieldPath: 'title',
 *     status: 'open',
 *   })
 *
 *   return <span>{comments.length}</span>
 * }
 * ```
 *
 * @beta
 */
export function useComments(options: WithResourceNameSupport<CommentsOptions>): UseCommentsResult {
  const {value, isPending, error} = useCommentList('useComments', options, SOURCE)
  return useMemo(() => ({comments: value, isPending, error}), [error, isPending, value])
}
