import {
  type CollaborationCommentCreate,
  type CollaborationCommentUpdate,
  type SanityClient,
} from '@sanity/client'
import {type Path} from '@sanity/types'

import {getCurrentUserState} from '../auth/authStore'
import {type DatasetHandle, type DocumentHandle} from '../config/sanityConfig'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StoreState} from '../store/createStoreState'
import {type StoreContext} from '../store/defineStore'
import {toCommentFieldPath} from './commentFieldPath'
import {toStoredMessage} from './commentMessage'
import {getCommentsClient, requireOrganizationId} from './commentsClient'
import {commentsStore, toSourceDocumentId, toWrittenCommentKeys} from './commentsStore'
import {normalizeComment} from './normalizeComment'
import {
  addComment,
  applyCommentUpdate,
  clearPendingTransaction,
  type CommentsStoreState,
  receiveComment,
  removeCommentById,
  restoreComments,
  rollbackCommentUpdate,
  setCommentCreateError,
  setPendingTransaction,
} from './reducers'
import {
  type Comment,
  type CommentMessage,
  type CommentRange,
  type CommentReactionShortName,
  type CommentStatus,
  type StoredComment,
} from './types'

/** @beta */
export interface CreateCommentOptions extends DocumentHandle {
  message: CommentMessage
  /**
   * Which field the thread hangs off, for example `title` or
   * `body[_key=="intro"].content`.
   *
   * Required, and it has to resolve to a real path. There is no such thing as a
   * comment on a document as a whole: the Studio only ever creates field
   * comments, and its comment inspector throws on an empty path rather than
   * ignoring it, so a pathless comment takes the inspector down for everyone
   * looking at that document.
   */
  fieldPath: string | Path
  /**
   * Anchors the comment to a run of text inside the field, by offset into the
   * Portable Text blocks it spans.
   *
   * The API resolves this into the stored selection and content snapshot, so
   * what comes back is {@link Comment.selection} rather than the range itself.
   */
  range?: CommentRange
  /** Reuse the id of a failed comment to retry it. Defaults to a new id. */
  commentId?: string
  /** Defaults to a new id, which starts a new thread. */
  threadId?: string
  /**
   * The `_rev` of the document when the comment was written.
   *
   * Not filled in automatically: the SDK's local document revision is replaced
   * by a transaction id while an edit is in flight, so it can name a revision
   * that never reached the server.
   */
  documentRevisionId?: string
  /**
   * Ambient information stored alongside the comment, for the writing app's own
   * use. Deliberately loose: the comment API treats this as free-form, so no
   * shape is worth promising.
   */
  context?: Record<string, unknown>
}

/** @beta */
export interface ReplyToCommentOptions extends DocumentHandle {
  /** The comment being replied to. Replies to a reply join the same thread. */
  parentCommentId: string
  message: CommentMessage
  commentId?: string
  context?: Record<string, unknown>
}

/** @beta */
export interface UpdateCommentOptions extends DatasetHandle {
  commentId: string
  message: CommentMessage
}

/** @beta */
export interface UpdateCommentRangeOptions extends DatasetHandle {
  commentId: string
  /**
   * Where the comment now attaches, within the field and document it already
   * targets. `null` drops the anchor and leaves a field-level comment.
   */
  range: CommentRange | null
}

/** @beta */
export interface SetCommentStatusOptions extends DatasetHandle {
  /** The thread's first comment. Replies follow their parent. */
  commentId: string
  status: CommentStatus
}

/** @beta */
export interface RemoveCommentOptions extends DatasetHandle {
  commentId: string
}

/** @beta */
export interface ReactionOptions extends DatasetHandle {
  commentId: string
  shortName: CommentReactionShortName
}

/**
 * Refuses to write a comment that points at nothing.
 *
 * The type already requires `fieldPath`, but an empty string or an empty path
 * array both survive that and normalise to `''`. Such a comment is not merely
 * useless: the Studio's comment inspector calls `fromString` on the stored
 * path, which throws on `''`, so the inspector crashes for everyone viewing
 * that document until the comment is deleted. Cheaper to refuse the write.
 */
function requireFieldPath(fieldPath: string | Path): string {
  const normalized = toCommentFieldPath(fieldPath)
  if (!normalized) {
    throw new Error(
      'A comment needs a field path. Comments attach to a field, not to a document as a whole.',
    )
  }
  return normalized
}

function requireCurrentUserId(instance: SanityInstance): string {
  const userId = getCurrentUserState(instance).getCurrent()?.id
  if (!userId) {
    throw new Error('Writing a comment requires a logged in user.')
  }
  return userId
}

function getWritableClient(
  instance: SanityInstance,
  key: BoundResourceKey,
  options: Pick<DatasetHandle, 'collaboration'>,
): SanityClient {
  return getCommentsClient(instance, {
    resource: key.resource,
    organizationId: requireOrganizationId(instance, options),
  })
}

function findComment(
  state: StoreState<CommentsStoreState>,
  commentId: string,
): StoredComment | undefined {
  for (const entry of Object.values(state.get().entries)) {
    const comments = entry?.comments
    const comment = comments && Object.hasOwn(comments, commentId) ? comments[commentId] : undefined
    if (comment) return comment
  }
  return undefined
}

/**
 * The comment as it will look once the server has it, near enough to show now.
 *
 * The API owns the timestamps, the revision, and — for an inline comment — the
 * resolved selection and content snapshot. The revision is left empty and the
 * timestamps stand in until the real comment arrives, because a list sorts on
 * `_createdAt` and cannot wait for a round trip. Everything a list renders is
 * present.
 */
function buildOptimisticComment(options: {
  authorId: string
  commentId: string
  context?: Record<string, unknown>
  documentRevisionId?: string
  documentType: string
  fieldPath: string
  message: CommentMessage
  parentCommentId?: string
  sourceDocumentId: string
  status: CommentStatus
  targetRef: StoredComment['target']['document']['_ref']
  threadId: string
}): StoredComment {
  const now = new Date().toISOString()

  return {
    _id: options.commentId,
    _type: 'sanity.comment',
    _createdAt: now,
    _updatedAt: now,
    _rev: '',
    _system: {createdBy: options.authorId},
    message: toStoredMessage(options.message),
    threadId: options.threadId,
    ...(options.parentCommentId ? {parentCommentId: options.parentCommentId} : {}),
    status: options.status,
    reactions: [],
    ...(options.context ? {context: options.context} : {}),
    target: {
      document: {_ref: options.targetRef, _type: 'globalDocumentReference', _weak: true},
      documentType: options.documentType,
      sourceDocumentId: options.sourceDocumentId,
      ...(options.documentRevisionId ? {documentRevisionId: options.documentRevisionId} : {}),
      path: {field: options.fieldPath},
    },
  }
}

/**
 * Writes a comment, showing it before the round trip so a thread feels
 * immediate.
 *
 * A failed create stays on screen carrying the failure, so an app can offer a
 * retry with the same id rather than silently losing what someone typed.
 *
 * Applied to every list the comment belongs in rather than just the one matching
 * the writer's own perspective, so a reader watching a different set of variants
 * does not have to wait for the listener to catch up.
 */
async function postComment(
  context: StoreContext<CommentsStoreState, BoundResourceKey>,
  commentsKeys: string[],
  optimistic: StoredComment,
  body: CollaborationCommentCreate,
  client: SanityClient,
): Promise<Comment> {
  const {state} = context

  for (const commentsKey of commentsKeys) {
    state.set('addComment', addComment(commentsKey, optimistic))
  }

  try {
    const created = await client.collaboration.comments.create(body, {tag: 'comments.create'})
    for (const commentsKey of commentsKeys) {
      state.set('receiveComment', receiveComment(commentsKey, created))
    }
    return normalizeComment(created)
  } catch (error) {
    state.set(
      'setCommentCreateError',
      setCommentCreateError(
        optimistic._id,
        error instanceof Error ? error : new Error(String(error)),
      ),
    )
    throw error
  }
}

/**
 * Starts a thread on one of a document's fields.
 *
 * The comment appears locally before the server confirms it; if the write fails
 * it stays, carrying `state.createError`, and retrying with the same
 * `commentId` replaces it.
 *
 * @beta
 */
export const createComment: (
  instance: SanityInstance,
  options: CreateCommentOptions,
) => Promise<Comment> = bindActionByResource(
  commentsStore,
  // `async` so a validation failure rejects rather than throwing at the call
  // site, which would slip past a `.catch()`.
  async (
    context: StoreContext<CommentsStoreState, BoundResourceKey>,
    options: CreateCommentOptions,
  ) => {
    const {instance, key} = context
    const client = getWritableClient(instance, key, options)
    const fieldPath = requireFieldPath(options.fieldPath)
    const commentId = options.commentId ?? crypto.randomUUID()
    const threadId = options.threadId ?? crypto.randomUUID()
    const sourceDocumentId = toSourceDocumentId(instance, options)

    const optimistic = buildOptimisticComment({
      authorId: requireCurrentUserId(instance),
      commentId,
      context: options.context,
      documentRevisionId: options.documentRevisionId,
      documentType: options.documentType,
      fieldPath,
      message: options.message,
      sourceDocumentId,
      status: 'open',
      targetRef: client.collaboration.comments.getTargetDocumentRef(sourceDocumentId),
      threadId,
    })

    return postComment(
      context,
      toWrittenCommentKeys(instance, options, optimistic),
      optimistic,
      {
        _id: commentId,
        message: toStoredMessage(options.message),
        threadId,
        ...(options.context ? {context: options.context} : {}),
        target: {
          documentId: sourceDocumentId,
          documentType: options.documentType,
          ...(options.documentRevisionId ? {documentRevisionId: options.documentRevisionId} : {}),
          // The API stores the field as `target.path.field` and resolves the
          // range against the document into a selection.
          ...(options.range ? {path: fieldPath, range: options.range} : {path: fieldPath}),
        },
      },
      client,
    )
  },
)

/**
 * Adds a reply to an existing thread.
 *
 * The thread, field, and status come from the parent comment, so a reply always
 * matches the same list as the comment it answers.
 *
 * @beta
 */
export const replyToComment: (
  instance: SanityInstance,
  options: ReplyToCommentOptions,
) => Promise<Comment> = bindActionByResource(
  commentsStore,
  async (
    context: StoreContext<CommentsStoreState, BoundResourceKey>,
    options: ReplyToCommentOptions,
  ) => {
    const {instance, key, state} = context
    const client = getWritableClient(instance, key, options)
    const commentId = options.commentId ?? crypto.randomUUID()
    const parent = findComment(state, options.parentCommentId)
    const sourceDocumentId = toSourceDocumentId(instance, options)

    // Replies to a reply belong to the thread's first comment, matching how the
    // Studio flattens threads.
    const parentCommentId = parent?.parentCommentId ?? options.parentCommentId

    const optimistic = buildOptimisticComment({
      authorId: requireCurrentUserId(instance),
      commentId,
      context: options.context,
      documentType: parent?.target.documentType ?? options.documentType,
      // Inherited from the parent when it is loaded. The API is the authority
      // either way: it copies the parent's target onto the reply.
      fieldPath: parent?.target.path?.field ?? '',
      message: options.message,
      parentCommentId,
      sourceDocumentId: parent?.target.sourceDocumentId ?? sourceDocumentId,
      status: parent?.status ?? 'open',
      targetRef:
        parent?.target.document._ref ??
        client.collaboration.comments.getTargetDocumentRef(sourceDocumentId),
      threadId: parent?.threadId ?? parentCommentId,
    })

    return postComment(
      context,
      toWrittenCommentKeys(instance, options, optimistic),
      optimistic,
      {
        _id: commentId,
        message: toStoredMessage(options.message),
        parentCommentId,
        ...(options.context ? {context: options.context} : {}),
      },
      client,
    )
  },
)

/**
 * Applies a change to one comment, showing it first and rolling it back if the
 * server rejects it.
 *
 * The optimistic patch is a function of the comment we hold, because most of
 * these changes are relative to it — a reaction added to the ones already
 * there, an anchor dropped from the target it shares with the field. When the
 * comment is not loaded there is nothing to show and nothing to roll back, so
 * the write goes out on its own.
 *
 * The transaction id is what tells our own echo apart from someone else's
 * write, so the listener can drop an outdated one rather than undoing this.
 */
async function writeOptimistically(
  {state, instance, key}: StoreContext<CommentsStoreState, BoundResourceKey>,
  options: DatasetHandle & {commentId: string},
  optimistic: (previous: StoredComment) => Partial<StoredComment>,
  write: (client: SanityClient, transactionId: string) => Promise<unknown>,
): Promise<void> {
  const {commentId} = options
  const transactionId = crypto.randomUUID()
  const previous = findComment(state, commentId)

  if (previous) {
    state.set('setPendingTransaction', setPendingTransaction(commentId, transactionId))
    state.set('applyCommentUpdate', applyCommentUpdate(commentId, optimistic(previous)))
  }

  try {
    await write(getWritableClient(instance, key, options), transactionId)
    if (previous) {
      state.set('clearPendingTransaction', clearPendingTransaction(commentId, transactionId))
    }
  } catch (error) {
    if (previous) {
      state.set('rollbackCommentUpdate', rollbackCommentUpdate(commentId, transactionId, previous))
    }
    throw error
  }
}

/** The above, for the changes that are a plain update of the comment. */
function patchComment(
  context: StoreContext<CommentsStoreState, BoundResourceKey>,
  options: DatasetHandle & {commentId: string},
  optimistic: (previous: StoredComment) => Partial<StoredComment>,
  body: CollaborationCommentUpdate,
  tag: string,
): Promise<void> {
  return writeOptimistically(context, options, optimistic, (client, transactionId) =>
    client.collaboration.comments.update(options.commentId, body, {transactionId, tag}),
  )
}

/**
 * Rewrites a comment's message and stamps `lastEditedAt`.
 * @beta
 */
export const updateComment: (
  instance: SanityInstance,
  options: UpdateCommentOptions,
) => Promise<void> = bindActionByResource(
  commentsStore,
  async (
    context: StoreContext<CommentsStoreState, BoundResourceKey>,
    options: UpdateCommentOptions,
  ) => {
    const message = toStoredMessage(options.message)
    return patchComment(
      context,
      options,
      () => ({message, lastEditedAt: new Date().toISOString()}),
      {message},
      'comments.update',
    )
  },
)

/**
 * Re-anchors a comment to a different run of text.
 *
 * Separate from {@link updateComment} because re-anchoring is mechanical — the
 * content moved under the comment — rather than something a person wrote, so it
 * leaves `lastEditedAt` alone. The API resolves the new range into a selection,
 * so the change shows up on `selection` once the write lands.
 *
 * @beta
 */
export const updateCommentRange: (
  instance: SanityInstance,
  options: UpdateCommentRangeOptions,
) => Promise<void> = bindActionByResource(
  commentsStore,
  async (
    context: StoreContext<CommentsStoreState, BoundResourceKey>,
    options: UpdateCommentRangeOptions,
  ) => {
    const {range} = options

    return patchComment(
      context,
      options,
      // A new anchor has nothing local to show: the selection it becomes is the
      // API's to resolve against the document. Dropping one is knowable, so
      // that shows straight away.
      (previous) =>
        range === null && previous.target.path
          ? {target: {...previous.target, path: {field: previous.target.path.field}}}
          : {},
      {range},
      'comments.update-range',
    )
  },
)

/**
 * Resolves or reopens a thread.
 *
 * Pass the thread's first comment: the API cascades the status to its replies.
 *
 * @beta
 */
export const setCommentStatus: (
  instance: SanityInstance,
  options: SetCommentStatusOptions,
) => Promise<void> = bindActionByResource(
  commentsStore,
  async (
    {state, instance, key}: StoreContext<CommentsStoreState, BoundResourceKey>,
    options: SetCommentStatusOptions,
  ) => {
    const {commentId, status} = options
    const transactionId = crypto.randomUUID()
    // Keyed by id, because the same comment can sit in several entries at once
    // and one rollback snapshot per comment is what is wanted. The patch below
    // reaches every entry holding it regardless.
    const previousComments = new Map<string, StoredComment>()

    // The cascade happens server-side, but a thread that resolves one comment
    // at a time on screen looks broken, so mirror it locally.
    for (const entry of Object.values(state.get().entries)) {
      for (const candidate of Object.values(entry?.comments ?? {})) {
        if (candidate._id !== commentId && candidate.parentCommentId !== commentId) continue
        if (previousComments.has(candidate._id)) continue
        previousComments.set(candidate._id, candidate)
        state.set('setPendingTransaction', setPendingTransaction(candidate._id, transactionId))
        state.set('updateCommentStatus', applyCommentUpdate(candidate._id, {status}))
      }
    }

    try {
      const client = getWritableClient(instance, key, options)
      await client.collaboration.comments.update(
        commentId,
        {status},
        {transactionId, tag: 'comments.set-status'},
      )
      for (const previous of previousComments.values()) {
        state.set('clearPendingTransaction', clearPendingTransaction(previous._id, transactionId))
      }
    } catch (error) {
      for (const previous of previousComments.values()) {
        state.set(
          'rollbackCommentUpdate',
          rollbackCommentUpdate(previous._id, transactionId, previous),
        )
      }
      throw error
    }
  },
)

/**
 * Deletes a comment, and its replies when it starts a thread.
 * @beta
 */
export const removeComment: (
  instance: SanityInstance,
  options: RemoveCommentOptions,
) => Promise<void> = bindActionByResource(
  commentsStore,
  async (
    {state, instance, key}: StoreContext<CommentsStoreState, BoundResourceKey>,
    options: RemoveCommentOptions,
  ) => {
    const {commentId} = options
    const removed = Object.entries(state.get().entries).flatMap(([entryKey, entry]) => {
      const comments = Object.values(entry?.comments ?? {}).filter(
        (comment) => comment._id === commentId || comment.parentCommentId === commentId,
      )
      return comments.length ? [{key: entryKey, comments}] : []
    })

    state.set('removeComment', removeCommentById(commentId))

    try {
      const client = getWritableClient(instance, key, options)
      await client.collaboration.comments.delete(commentId, {tag: 'comments.remove'})
    } catch (error) {
      state.set('restoreComments', restoreComments(removed))
      throw error
    }
  },
)

/**
 * Applies a reaction change locally, then asks the server for it.
 *
 * Reactions are per user, so the local guess only has to add or drop this
 * user's own entry. The `_key` is the server's to assign; a reaction is
 * addressed by short name and user, so a stand-in is harmless until the real
 * comment arrives.
 */
function writeReaction(
  context: StoreContext<CommentsStoreState, BoundResourceKey>,
  options: ReactionOptions,
  reacted: boolean,
): Promise<void> {
  const {commentId, shortName} = options
  const userId = requireCurrentUserId(context.instance)

  return writeOptimistically(
    context,
    options,
    (previous) => {
      const withoutMine = previous.reactions.filter(
        (reaction) => reaction.shortName !== shortName || reaction.userId !== userId,
      )

      return {
        reactions: reacted
          ? [
              ...withoutMine,
              {_key: crypto.randomUUID(), shortName, userId, addedAt: new Date().toISOString()},
            ]
          : withoutMine,
      }
    },
    ({collaboration: {comments}}, transactionId) =>
      reacted
        ? comments.addReaction(commentId, shortName, {transactionId, tag: 'comments.add-reaction'})
        : comments.removeReaction(commentId, shortName, {
            transactionId,
            tag: 'comments.remove-reaction',
          }),
  )
}

/**
 * Adds the current user's reaction to a comment.
 *
 * Explicit rather than a toggle: an app knows whether the user has already
 * reacted, and a toggle would guess wrong whenever the list is a moment stale.
 * Adding a reaction that is already there is harmless.
 *
 * @beta
 */
export const addReaction: (instance: SanityInstance, options: ReactionOptions) => Promise<void> =
  bindActionByResource(
    commentsStore,
    async (context: StoreContext<CommentsStoreState, BoundResourceKey>, options: ReactionOptions) =>
      writeReaction(context, options, true),
  )

/**
 * Removes the current user's reaction from a comment.
 * @beta
 */
export const removeReaction: (instance: SanityInstance, options: ReactionOptions) => Promise<void> =
  bindActionByResource(
    commentsStore,
    async (context: StoreContext<CommentsStoreState, BoundResourceKey>, options: ReactionOptions) =>
      writeReaction(context, options, false),
  )
