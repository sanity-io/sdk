import {
  type CommentsOptions,
  type CommentThread,
  getCommentThreadsState,
  resolveCommentThreads,
} from '@sanity/sdk'
import {getCommentsOptionsKey, parseCommentsOptionsKey} from '@sanity/sdk/_internal'
import {useMemo} from 'react'

import {type WithResourceNameSupport} from '../../helpers/useNormalizedResourceOptions'
import {type CommentListSource, useCommentList} from '../useCommentList'
import {getNoCommentsErrorState} from './noCommentsError'

/**
 * @public
 * @category Types
 * @deprecated Renamed alongside {@link useCommentThreads}; see `UseDocumentCommentsResult` in
 * `@sanity/sdk-react/collaboration`.
 */
export interface UseCommentThreadsResult {
  /** Newest thread first, each with its replies oldest first. */
  threads: CommentThread[]
  /** True while switching to a different document or filter. */
  isPending: boolean
}

const SOURCE: CommentListSource<CommentsOptions, CommentThread[]> = {
  getState: getCommentThreadsState,
  getErrorState: getNoCommentsErrorState,
  resolve: resolveCommentThreads,
  getKey: getCommentsOptionsKey,
  parseKey: parseCommentsOptionsKey,
}

/**
 * Reads a document's comments grouped into threads.
 *
 * A thread is one comment plus its replies. Its `status` and `fieldPath` come
 * from the first comment, so filtering by either selects whole threads rather
 * than stray replies.
 *
 * Unlike the Studio, every thread is returned. The Studio hides threads whose
 * field has left the schema or is hidden by a conditional, which it can do
 * because it has the schema to check against. Inspect `fieldPath` yourself if
 * your app needs to do the same.
 *
 * @category Comments
 * @function
 * @param options - The document to read, optionally narrowed by `fieldPath` or `status`
 * @returns The matching threads, and whether a switch is in flight
 *
 * @example Render the open threads on a document
 * ```tsx
 * function Threads({documentId}: {documentId: string}) {
 *   const {threads} = useCommentThreads({
 *     documentId,
 *     documentType: 'article',
 *     status: 'open',
 *   })
 *
 *   return (
 *     <ul>
 *       {threads.map((thread) => (
 *         <li key={thread.threadId}>
 *           {thread.fieldPath || 'Document'} — {thread.commentsCount} comments
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 *
 * @public
 * @deprecated Comments have moved to the organization collaboration API. Use
 * `useDocumentComments` from `@sanity/sdk-react/collaboration`, which returns the same thread
 * shape. This add-on dataset hook is removed in the next major.
 */
export function useCommentThreads(
  options: WithResourceNameSupport<CommentsOptions>,
): UseCommentThreadsResult {
  const {value, isPending} = useCommentList('useCommentThreads', options, SOURCE)
  return useMemo(() => ({threads: value, isPending}), [isPending, value])
}
