import {type Comment, type CommentsOptions, getCommentsState, resolveComments} from '@sanity/sdk'
import {getCommentsOptionsKey, parseCommentsOptionsKey} from '@sanity/sdk/_internal'
import {useMemo} from 'react'

import {type WithResourceNameSupport} from '../../helpers/useNormalizedResourceOptions'
import {type CommentListSource, useCommentList} from '../useCommentList'
import {getNoCommentsErrorState} from './noCommentsError'

/**
 * @public
 * @category Types
 * @deprecated Renamed alongside {@link useComments}; see `useDocumentComments` in
 * `@sanity/sdk-react/collaboration`.
 */
export interface UseCommentsResult {
  /** Every matching comment, newest first, replies included. */
  comments: Comment[]
  /** True while switching to a different document or filter. */
  isPending: boolean
}

const SOURCE: CommentListSource<CommentsOptions, Comment[]> = {
  getState: getCommentsState,
  getErrorState: getNoCommentsErrorState,
  resolve: resolveComments,
  getKey: getCommentsOptionsKey,
  parseKey: parseCommentsOptionsKey,
}

/**
 * Reads a document's comments and keeps them up to date.
 *
 * Comments are shared with the Studio: they live in the project's comments
 * dataset, so a thread started here shows up there and the other way round. The
 * list is flat, replies included; reach for {@link useCommentThreads} to read it
 * grouped.
 *
 * Suspends until the comments have loaded. Switching document or filter is a
 * transition, so the previous list stays on screen and `isPending` goes true
 * rather than the component suspending again.
 *
 * @category Comments
 * @function
 * @param options - The document to read, optionally narrowed by `fieldPath` or `status`
 * @returns The matching comments, and whether a switch is in flight
 *
 * @example Count the open threads on a field
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
 * @public
 * @deprecated Comments have moved to the organization collaboration API. Read threads with
 * `useDocumentComments` from `@sanity/sdk-react/collaboration`, or pass a GROQ filter to
 * `useCommentsQuery` for anything that is not one document's comments. This add-on dataset
 * hook is removed in the next major.
 */
export function useComments(options: WithResourceNameSupport<CommentsOptions>): UseCommentsResult {
  const {value, isPending} = useCommentList('useComments', options, SOURCE)
  return useMemo(() => ({comments: value, isPending}), [isPending, value])
}
