import {omitProperty} from '../utils/object'
import {type CommentPostPayload, type StoredComment} from './types'

interface CommentsEntry {
  /** `undefined` until the first snapshot arrives, which is what suspends readers. */
  comments?: Record<string, StoredComment>
  error?: unknown
  subscribers: string[]
}

export interface CommentsStoreState {
  entries: {[key: string]: CommentsEntry | undefined}
  /** Comment creates that have not been confirmed by the server yet. */
  pendingCreates: {[commentId: string]: true | undefined}
  /**
   * The most recent transaction this client started per comment, held only
   * while the write is in flight.
   *
   * The listener echoes our own writes back. Without this, an echo from an
   * earlier transaction could arrive after a later one and undo it on screen.
   * Cleared as soon as the write settles: applying our own echo after that is
   * harmless, because it carries the same data we already show.
   */
  pendingTransactions: {[commentId: string]: string | undefined}
  error?: unknown
}

export interface CommentsKeyParts {
  documentId: string
  documentVersionId?: string
}

export function getCommentsKey({documentId, documentVersionId}: CommentsKeyParts): string {
  return JSON.stringify([documentId, documentVersionId ?? null])
}

export function parseCommentsKey(key: string): CommentsKeyParts {
  const [documentId, documentVersionId] = JSON.parse(key) as [string, string | null]
  return {documentId, ...(documentVersionId ? {documentVersionId} : {})}
}

export const addSubscriber =
  (key: string, subscriptionId: string) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entry = prev.entries[key]
    const subscribers = [...(entry?.subscribers ?? []), subscriptionId]
    return {...prev, entries: {...prev.entries, [key]: {...entry, subscribers}}}
  }

export const removeSubscriber =
  (key: string, subscriptionId: string) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entry = prev.entries[key]
    if (!entry) return prev
    const subscribers = entry.subscribers.filter((id) => id !== subscriptionId)
    if (!subscribers.length) {
      const pendingCreates = {...prev.pendingCreates}
      const pendingTransactions = {...prev.pendingTransactions}

      for (const commentId of Object.keys(entry.comments ?? {})) {
        delete pendingCreates[commentId]
        delete pendingTransactions[commentId]
      }

      return {
        ...prev,
        entries: omitProperty(prev.entries, key),
        pendingCreates,
        pendingTransactions,
      }
    }
    return {...prev, entries: {...prev.entries, [key]: {...entry, subscribers}}}
  }

/** Replaces an entry's contents with a freshly fetched snapshot. */
export const setComments =
  (key: string, comments: StoredComment[]) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entry = prev.entries[key]
    if (!entry) return prev
    const byId = Object.fromEntries(comments.map((comment) => [comment._id, comment]))
    const pendingCreates = {...prev.pendingCreates}

    for (const [commentId, localComment] of Object.entries(entry.comments ?? {})) {
      if (Object.hasOwn(byId, commentId)) {
        delete pendingCreates[commentId]
      } else if (Object.hasOwn(pendingCreates, commentId) || localComment._state) {
        // A snapshot can race an in-flight create. Failed creates are also local
        // drafts and must remain available for retry.
        byId[commentId] = localComment
      }
    }

    return {
      ...prev,
      entries: {...prev.entries, [key]: {...entry, comments: byId, error: undefined}},
      pendingCreates,
    }
  }

export const setCommentsError =
  (key: string, error: unknown) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entry = prev.entries[key]
    if (!entry) return prev
    return {...prev, entries: {...prev.entries, [key]: {...entry, error}}}
  }

/** A comment as it arrived from the server, replacing whatever we held. */
export const receiveComment =
  (key: string, comment: StoredComment) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entry = prev.entries[key]
    const pendingCreates = omitProperty(prev.pendingCreates, comment._id)
    if (!entry) return {...prev, pendingCreates}
    return {
      ...prev,
      pendingCreates,
      entries: {
        ...prev.entries,
        [key]: {...entry, comments: {...entry.comments, [comment._id]: comment}},
      },
    }
  }

/**
 * A comment we just wrote, shown before the server confirms it.
 *
 * `_createdAt` is assigned by the server, but the list sorts on it, so an
 * optimistic comment needs a stand-in until the real value arrives.
 */
type OptimisticComment = CommentPostPayload & {_createdAt?: string; _rev?: string}

/** A create that already failed once is being retried, not written fresh. */
function isRetryingCreate(existing: StoredComment | undefined): boolean {
  const state = existing?._state?.type
  return state === 'createError' || state === 'createRetrying'
}

function mergeOptimisticComment(
  existing: StoredComment | undefined,
  comment: OptimisticComment,
): StoredComment {
  return {
    ...existing,
    ...comment,
    _createdAt: comment._createdAt ?? existing?._createdAt ?? new Date().toISOString(),
    _rev: comment._rev ?? existing?._rev ?? '',
    ...(isRetryingCreate(existing) ? {_state: {type: 'createRetrying'} as const} : {}),
  }
}

export const addComment =
  (key: string, comment: OptimisticComment) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entry = prev.entries[key]
    if (!entry) return prev

    const existing =
      entry.comments && Object.hasOwn(entry.comments, comment._id)
        ? entry.comments[comment._id]
        : undefined

    return {
      ...prev,
      pendingCreates: {...prev.pendingCreates, [comment._id]: true},
      entries: {
        ...prev.entries,
        [key]: {
          ...entry,
          comments: {
            ...entry.comments,
            [comment._id]: mergeOptimisticComment(existing, comment),
          },
        },
      },
    }
  }

/**
 * Merges a partial update into whichever entry holds the comment.
 *
 * Comment ids are unique, so this touches one entry in practice. Searching by
 * id rather than taking a key means callers editing a comment do not have to
 * say which document it belongs to.
 */
export const applyCommentUpdate =
  (commentId: string, patch: Partial<StoredComment>) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entries = {...prev.entries}
    let changed = false

    for (const [key, entry] of Object.entries(prev.entries)) {
      const comment = entry?.comments?.[commentId]
      if (!entry || !comment) continue
      changed = true
      entries[key] = {
        ...entry,
        comments: {...entry.comments, [commentId]: {...comment, ...patch}},
      }
    }

    return changed ? {...prev, entries} : prev
  }

/** Removes a comment and, when it is a thread parent, its replies. */
export const removeCommentById =
  (commentId: string) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entries = {...prev.entries}
    const removedIds = new Set<string>()
    let changed = false

    for (const [key, entry] of Object.entries(prev.entries)) {
      if (!entry?.comments) continue

      const remaining = Object.fromEntries(
        Object.entries(entry.comments).filter(([id, comment]) => {
          const keep = id !== commentId && comment.parentCommentId !== commentId
          if (!keep) removedIds.add(id)
          return keep
        }),
      )

      if (Object.keys(remaining).length === Object.keys(entry.comments).length) continue

      changed = true
      entries[key] = {...entry, comments: remaining}
    }

    if (!changed) return prev

    const pendingCreates = {...prev.pendingCreates}
    const pendingTransactions = {...prev.pendingTransactions}
    for (const id of removedIds) {
      delete pendingCreates[id]
      delete pendingTransactions[id]
    }

    return {...prev, entries, pendingCreates, pendingTransactions}
  }

export const setPendingTransaction =
  (commentId: string, transactionId: string) =>
  (prev: CommentsStoreState): CommentsStoreState => ({
    ...prev,
    pendingTransactions: {...prev.pendingTransactions, [commentId]: transactionId},
  })

export const clearPendingTransaction =
  (commentId: string) =>
  (prev: CommentsStoreState): CommentsStoreState => ({
    ...prev,
    pendingTransactions: omitProperty(prev.pendingTransactions, commentId),
  })

/** Marks a pending create as failed, unless another request already confirmed it. */
export const setCommentCreateError =
  (commentId: string, error: Error) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    if (!Object.hasOwn(prev.pendingCreates, commentId)) return prev
    const next = applyCommentUpdate(commentId, {_state: {type: 'createError', error}})(prev)
    return {...next, pendingCreates: omitProperty(next.pendingCreates, commentId)}
  }

/** Restores an optimistic edit if the failed transaction is still current. */
export const rollbackCommentUpdate =
  (commentId: string, transactionId: string, previous: StoredComment) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    if (
      !Object.hasOwn(prev.pendingTransactions, commentId) ||
      prev.pendingTransactions[commentId] !== transactionId
    ) {
      return prev
    }

    const entries = Object.fromEntries(
      Object.entries(prev.entries).map(([key, entry]) => {
        if (!entry?.comments?.[commentId]) return [key, entry]
        return [key, {...entry, comments: {...entry.comments, [commentId]: previous}}]
      }),
    )

    return {
      ...prev,
      entries,
      pendingTransactions: omitProperty(prev.pendingTransactions, commentId),
    }
  }

/** Restores comments removed optimistically when the server delete fails. */
export const restoreComments =
  (removed: Array<{key: string; comments: StoredComment[]}>) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entries = {...prev.entries}
    let changed = false

    for (const {key, comments} of removed) {
      const entry = entries[key]
      if (!entry) continue
      const missing = comments.filter(
        (comment) => !Object.hasOwn(entry.comments ?? {}, comment._id),
      )
      if (!missing.length) continue
      changed = true
      entries[key] = {
        ...entry,
        comments: Object.fromEntries([
          ...Object.entries(entry.comments ?? {}),
          ...missing.map((comment) => [comment._id, comment] as const),
        ]),
      }
    }

    return changed ? {...prev, entries} : prev
  }
