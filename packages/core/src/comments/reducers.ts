import {omitProperty} from '../utils/object'
import {type StoredComment} from './types'

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
  /**
   * The server state carried by an echo that was held back rather than applied,
   * per comment.
   *
   * Holding someone else's echo back is what keeps it from undoing our own
   * optimistic change on screen, but their change is committed. If our write
   * then fails, rolling back to the comment as it stood before it would erase
   * theirs, and no further event is coming to bring it back. Kept so a rollback
   * can land on the server's state instead.
   */
  droppedEchoes: {[commentId: string]: StoredComment | undefined}
  error?: unknown
}

/**
 * What an entry holds comments for: one GROQ filter, in one organization.
 *
 * Both read paths reduce to this. A document read derives the filter from the
 * document and the variants asked for; a query read is handed one.
 */
export interface CommentsKeyParts {
  filter: string
  params: Record<string, unknown>
  organizationId: string
}

export function getCommentsKey({filter, params, organizationId}: CommentsKeyParts): string {
  // Parameters are sorted so two callers passing the same ones in a different
  // order address one entry rather than two.
  const sortedParams = Object.keys(params)
    .sort()
    .map((name) => [name, params[name]])

  return JSON.stringify([organizationId, filter, sortedParams])
}

export function parseCommentsKey(key: string): CommentsKeyParts {
  const [organizationId, filter, params] = JSON.parse(key) as [string, string, [string, unknown][]]
  return {organizationId, filter, params: Object.fromEntries(params)}
}

/**
 * Whether any entry still holds the comment.
 *
 * The reconciliation state below is keyed by comment id rather than by entry,
 * because a write is in flight against a comment rather than against a list, and
 * a comment sits in every list its target matches. So it outlives any one of
 * them: only the last list to let go of a comment may clear its markers.
 */
function isHeld(entries: CommentsStoreState['entries'], commentId: string): boolean {
  return Object.values(entries).some((entry) => Object.hasOwn(entry?.comments ?? {}, commentId))
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
      const entries = omitProperty(prev.entries, key)
      const pendingCreates = {...prev.pendingCreates}
      const pendingTransactions = {...prev.pendingTransactions}
      const droppedEchoes = {...prev.droppedEchoes}

      for (const commentId of Object.keys(entry.comments ?? {})) {
        if (isHeld(entries, commentId)) continue
        delete pendingCreates[commentId]
        delete pendingTransactions[commentId]
        delete droppedEchoes[commentId]
      }

      return {...prev, entries, pendingCreates, pendingTransactions, droppedEchoes}
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
    // A fresh server document supersedes any older one we were holding back.
    const droppedEchoes = omitProperty(prev.droppedEchoes, comment._id)
    if (!entry) return {...prev, pendingCreates, droppedEchoes}
    return {
      ...prev,
      pendingCreates,
      droppedEchoes,
      entries: {
        ...prev.entries,
        [key]: {...entry, comments: {...entry.comments, [comment._id]: comment}},
      },
    }
  }

/**
 * Keeps the server state an echo carried, for a comment whose echo could not be
 * applied because a later write of ours was in flight.
 */
export const recordDroppedEcho =
  (comment: StoredComment) =>
  (prev: CommentsStoreState): CommentsStoreState => ({
    ...prev,
    droppedEchoes: {...prev.droppedEchoes, [comment._id]: comment},
  })

/** A create that already failed once is being retried, not written fresh. */
function isRetryingCreate(existing: StoredComment | undefined): boolean {
  const state = existing?._state?.type
  return state === 'createError' || state === 'createRetrying'
}

function mergeOptimisticComment(
  existing: StoredComment | undefined,
  comment: StoredComment,
): StoredComment {
  return {
    ...existing,
    ...comment,
    // A retry keeps the time the comment first appeared, so it does not jump to
    // the top of a list sorted on `_createdAt` every time it is attempted.
    _createdAt: existing?._createdAt ?? comment._createdAt,
    ...(isRetryingCreate(existing) ? {_state: {type: 'createRetrying'} as const} : {}),
  }
}

/** A comment we just wrote, shown before the server confirms it. */
export const addComment =
  (key: string, comment: StoredComment) =>
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

/**
 * Removes one comment from one entry, leaving its replies alone.
 *
 * What a listener's `disappear` event means: that comment left *this* entry's
 * filter. It may have left because it was deleted, but it may equally have been
 * edited out of a filter another entry still matches, so neither the other
 * entries nor the comment's replies can be assumed gone. A real thread delete
 * arrives as a `disappear` per comment, and until the replies' own events land
 * `buildCommentThreads` drops a reply whose parent it cannot see.
 */
export const removeCommentFromEntry =
  (key: string, commentId: string) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    const entry = prev.entries[key]
    if (!entry?.comments || !Object.hasOwn(entry.comments, commentId)) return prev

    const entries = {
      ...prev.entries,
      [key]: {...entry, comments: omitProperty(entry.comments, commentId)},
    }

    // The comment can still be in another entry, whose in-flight write is the
    // one these markers belong to.
    if (isHeld(entries, commentId)) return {...prev, entries}

    return {
      ...prev,
      entries,
      pendingCreates: omitProperty(prev.pendingCreates, commentId),
      pendingTransactions: omitProperty(prev.pendingTransactions, commentId),
      droppedEchoes: omitProperty(prev.droppedEchoes, commentId),
    }
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
    const droppedEchoes = {...prev.droppedEchoes}
    for (const id of removedIds) {
      delete pendingCreates[id]
      delete pendingTransactions[id]
      delete droppedEchoes[id]
    }

    return {...prev, entries, pendingCreates, pendingTransactions, droppedEchoes}
  }

export const setPendingTransaction =
  (commentId: string, transactionId: string) =>
  (prev: CommentsStoreState): CommentsStoreState => ({
    ...prev,
    pendingTransactions: {...prev.pendingTransactions, [commentId]: transactionId},
  })

/**
 * Drops the marker for one transaction, if it is still the current one.
 *
 * Two writes to the same comment can overlap, and the second one's marker is
 * what protects it: clearing whichever marker happens to be there would let the
 * first write's echo overwrite the second's optimistic state, and would leave
 * the second unable to roll itself back.
 */
export const clearPendingTransaction =
  (commentId: string, transactionId: string) =>
  (prev: CommentsStoreState): CommentsStoreState => {
    if (prev.pendingTransactions[commentId] !== transactionId) return prev
    return {
      ...prev,
      pendingTransactions: omitProperty(prev.pendingTransactions, commentId),
      // The write landed, so our own echo carries the server's merge of it and
      // whatever else arrived meanwhile. Anything held back is stale.
      droppedEchoes: omitProperty(prev.droppedEchoes, commentId),
    }
  }

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

    // Someone else's change arrived while this write was in flight and was held
    // back rather than applied. The write failed, so their version is what the
    // server holds: land on it rather than on what we had before.
    const restored = prev.droppedEchoes[commentId] ?? previous

    const entries = Object.fromEntries(
      Object.entries(prev.entries).map(([key, entry]) => {
        if (!entry?.comments?.[commentId]) return [key, entry]
        return [key, {...entry, comments: {...entry.comments, [commentId]: restored}}]
      }),
    )

    return {
      ...prev,
      entries,
      pendingTransactions: omitProperty(prev.pendingTransactions, commentId),
      droppedEchoes: omitProperty(prev.droppedEchoes, commentId),
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
