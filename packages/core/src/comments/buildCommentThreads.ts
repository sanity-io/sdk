import {type CommentStatus} from './types'

/**
 * What threading needs off a comment: its identity and parentage, plus the
 * fields a thread takes from its first comment.
 *
 * Structural rather than {@link Comment}, so the deprecated add-on dataset
 * store can thread its own comment shape through the same function.
 */
interface ThreadableComment {
  id: string
  createdAt: string
  threadId: string
  fieldPath: string
  status: CommentStatus
  parentCommentId?: string
}

/** A thread over whichever comment shape was threaded. */
interface ThreadOf<TComment> {
  threadId: string
  fieldPath: string
  parentComment: TComment
  replies: TComment[]
  commentsCount: number
  status: CommentStatus
  lastActivityAt: string
}

/**
 * Groups a flat comment list into threads.
 *
 * A thread's parent is the comment with no `parentCommentId`; replies point at
 * the parent's `id`. Replies whose parent is missing from the input are
 * dropped, which is what happens when a parent is deleted but its replies have
 * not disappeared yet.
 *
 * Threads come back in the order their parents appear in `comments`, so passing
 * the store's newest-first list gives newest-thread-first. Replies within a
 * thread are always oldest first, since that is reading order.
 *
 * @internal
 */
export function buildCommentThreads<TComment extends ThreadableComment>(
  comments: TComment[],
): ThreadOf<TComment>[] {
  const repliesByParent = new Map<string, TComment[]>()

  for (const comment of comments) {
    if (!comment.parentCommentId) continue
    const existing = repliesByParent.get(comment.parentCommentId)
    if (existing) {
      existing.push(comment)
    } else {
      repliesByParent.set(comment.parentCommentId, [comment])
    }
  }

  const threads: ThreadOf<TComment>[] = []

  for (const parentComment of comments) {
    if (parentComment.parentCommentId) continue

    // The array is built above and owned here, so sorting in place is safe.
    const replies = (repliesByParent.get(parentComment.id) ?? []).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )

    const lastReply = replies[replies.length - 1]

    threads.push({
      threadId: parentComment.threadId,
      fieldPath: parentComment.fieldPath,
      parentComment,
      replies,
      commentsCount: replies.length + 1,
      status: parentComment.status,
      lastActivityAt: lastReply ? lastReply.createdAt : parentComment.createdAt,
    })
  }

  return threads
}
