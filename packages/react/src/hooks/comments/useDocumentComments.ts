import {
  type CommentsOptions,
  type CommentThread,
  getDocumentCommentsState,
  resolveDocumentComments,
} from '@sanity/sdk'
import {getDocumentCommentsOptionsKey, parseDocumentCommentsOptionsKey} from '@sanity/sdk/_internal'
import {useMemo} from 'react'

import {type WithResourceNameSupport} from '../helpers/useNormalizedResourceOptions'
import {type CommentListSource, useCommentList} from './useCommentList'

/**
 * @public
 * @category Types
 */
export interface UseDocumentCommentsResult {
  /** Matching threads, newest first, each with its replies oldest first. */
  threads: CommentThread[]
  /** True while switching to a different document or filter. */
  isPending: boolean
}

const SOURCE: CommentListSource<CommentsOptions, CommentThread[]> = {
  getState: getDocumentCommentsState,
  resolve: resolveDocumentComments,
  getKey: getDocumentCommentsOptionsKey,
  parseKey: parseDocumentCommentsOptionsKey,
}

/**
 * Reads a document's comment threads and keeps them up to date.
 *
 * Comments are stored per organization, so `collaboration.organizationId` has to
 * be configured — on the Sanity config, or per call.
 *
 * Threads are the default shape: a thread carries its first comment plus its
 * replies, and `status` and `fieldPath` come from that first comment, so
 * filtering by either selects whole threads. Use `variants` to say which
 * versions of the document to pool; by default it follows the perspective in
 * view. Reach for {@link useCommentsQuery} when the question is not "comments on
 * this document".
 *
 * Suspends until the comments have loaded. Switching document or filter is a
 * transition, so the previous list stays on screen and `isPending` goes true
 * rather than the component suspending again.
 *
 * @category Comments
 * @function
 * @param options - The document to read, optionally narrowed by `fieldPath`, `status`, or `variants`
 * @returns The matching threads, and whether a switch is in flight
 *
 * @example Count the open threads on a field
 * ```tsx
 * function TitleCommentCount({documentId}: {documentId: string}) {
 *   const {threads} = useDocumentComments({
 *     documentId,
 *     documentType: 'article',
 *     fieldPath: 'title',
 *     status: 'open',
 *   })
 *
 *   return <span>{threads.length}</span>
 * }
 * ```
 *
 * @public
 */
export function useDocumentComments(
  options: WithResourceNameSupport<CommentsOptions>,
): UseDocumentCommentsResult {
  const {value, isPending} = useCommentList('useDocumentComments', options, SOURCE)
  return useMemo(() => ({threads: value, isPending}), [isPending, value])
}
