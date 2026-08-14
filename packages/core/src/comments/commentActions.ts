import {type SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'
import {type Path} from '@sanity/types'
import {filter, firstValueFrom, take} from 'rxjs'

import {getCurrentUserState} from '../auth/authStore'
import {getClient} from '../client/clientStore'
import {
  type DatasetHandle,
  type DatasetResource,
  type DocumentHandle,
  type DocumentResource,
} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StoreState} from '../store/createStoreState'
import {type StoreContext} from '../store/defineStore'
import {
  assertDatasetResource,
  getAddonDatasetState,
  provisionAddonDataset,
} from './addonDatasetStore'
import {toCommentFieldPath} from './commentFieldPath'
import {COMMENTS_API_VERSION} from './commentsConstants'
import {type CommentsOptions, commentsStore, toCommentsKeyParts} from './commentsStore'
import {normalizeComment} from './normalizeComment'
import {
  addComment,
  applyCommentUpdate,
  clearPendingTransaction,
  type CommentsStoreState,
  getCommentsKey,
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
  type CommentPostPayload,
  type CommentStatus,
  type CommentTextSelection,
  type StoredComment,
} from './types'
import {weakenReferencesInContentSnapshot} from './weakenReferences'

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
   * Anchors the comment to a run of text inside a Portable Text field. Building
   * one needs a live editor, so this comes from
   * `@portabletext/plugin-sdk-value` rather than being constructed by hand.
   */
  selection?: CommentTextSelection
  /** Reuse the id of a failed comment to retry it. Defaults to a new id. */
  commentId?: string
  /** Defaults to a new id, which starts a new thread. */
  threadId?: string
  /** @defaultValue `'open'` */
  status?: CommentStatus
  /**
   * The `_rev` of the document when the comment was written.
   *
   * Not filled in automatically: the SDK's local document revision is replaced
   * by a transaction id while an edit is in flight, so it can name a revision
   * that never reached the server. Nothing in the Studio reads this today.
   */
  documentRevisionId?: string
  /**
   * Ambient information stored alongside the comment, merged over the defaults.
   *
   * The Studio writes `tool`, `payload`, `intent`, and `notification` here for
   * its notification backend. The SDK has no source for any of them, so
   * mentions in comments created this way do not send email unless you supply
   * `notification` yourself. Deliberately loose: the organization-level store
   * treats this as free-form, so no shape is worth promising.
   */
  context?: Record<string, unknown>
  /** A copy of the content being discussed. References in it are weakened. */
  contentSnapshot?: unknown
}

/** @beta */
export interface ReplyToCommentOptions extends DocumentHandle {
  /** The comment being replied to. Replies to a reply join the same thread. */
  parentCommentId: string
  message: CommentMessage
  commentId?: string
  /** Only needed when the parent is not loaded, such as following a deep link. */
  threadId?: string
  /** Only needed when the parent is not loaded. */
  fieldPath?: string | Path
  /** Required when the parent is not loaded. */
  status?: CommentStatus
}

/** @beta */
export interface UpdateCommentOptions extends DatasetHandle {
  commentId: string
  message: CommentMessage
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

/** Waits out discovery, then insists the addon dataset exists. */
async function requireAddonDataset(
  instance: SanityInstance,
  resource: DocumentResource,
): Promise<string> {
  const datasetName = await firstValueFrom(
    getAddonDatasetState(instance, {resource}).observable.pipe(
      filter((value) => value !== undefined),
      take(1),
    ),
  )

  if (!datasetName) {
    throw new Error('This project has no comments dataset, so there is no comment to change.')
  }

  return datasetName
}

async function getWritableClient(
  instance: SanityInstance,
  resource: DocumentResource,
  {createIfMissing}: {createIfMissing: boolean},
): Promise<SanityClient> {
  const {projectId} = assertDatasetResource(resource)

  // Provisioning is a project-wide side effect, so only the create path may
  // trigger it. Editing or deleting a comment implies the dataset is there.
  const dataset = createIfMissing
    ? await provisionAddonDataset(instance, {resource})
    : await requireAddonDataset(instance, resource)

  return getClient(instance, {apiVersion: COMMENTS_API_VERSION, projectId, dataset})
}

function buildCommentPayload(options: {
  authorId: string
  commentId: string
  contentSnapshot?: unknown
  context?: Record<string, unknown>
  documentRevisionId?: string
  handle: DocumentHandle
  message: CommentMessage
  parentCommentId?: string
  resource: DatasetResource
  fieldPath: string
  selection?: CommentTextSelection
  status: CommentStatus
  threadId: string
  documentVersionId?: string
}): CommentPostPayload {
  const {handle, resource} = options

  return {
    _id: options.commentId,
    _type: 'comment',
    authorId: options.authorId,
    message: options.message,
    threadId: options.threadId,
    ...(options.parentCommentId ? {parentCommentId: options.parentCommentId} : {}),
    status: options.status,
    reactions: null,
    // The Studio writes an empty tool name when no tool is active, and reads
    // this nowhere in its UI.
    context: {tool: '', ...options.context},
    ...(options.contentSnapshot === undefined
      ? {}
      : {contentSnapshot: weakenReferencesInContentSnapshot(options.contentSnapshot)}),
    target: {
      documentRevisionId: options.documentRevisionId ?? '',
      path: {
        field: options.fieldPath,
        ...(options.selection ? {selection: options.selection} : {}),
      },
      // The comment lives in the addon dataset, so this points across to the
      // dataset holding the document. Weak, or Content Lake would refuse to
      // delete a commented document.
      document: {
        _dataset: resource.dataset,
        _projectId: resource.projectId,
        _ref: getPublishedId(DocumentId(handle.documentId)),
        _type: 'crossDatasetReference',
        _weak: true,
      },
      documentType: handle.documentType,
      ...(options.documentVersionId ? {documentVersionId: options.documentVersionId} : {}),
    },
  }
}

function findComment(
  state: StoreState<CommentsStoreState>,
  commentsKey: string,
  commentId: string,
): StoredComment | undefined {
  const comments = state.get().entries[commentsKey]?.comments
  return comments && Object.hasOwn(comments, commentId) ? comments[commentId] : undefined
}

function findCommentById(
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

async function postComment(
  context: StoreContext<CommentsStoreState, BoundResourceKey>,
  handle: DocumentHandle & CommentsOptions,
  payload: CommentPostPayload,
): Promise<Comment> {
  const {state, instance, key} = context
  const commentsKey = getCommentsKey(toCommentsKeyParts(instance, handle))

  // Show it before the round trip, so a thread feels immediate.
  state.set('addComment', addComment(commentsKey, payload))

  try {
    const client = await getWritableClient(instance, key.resource, {createIfMissing: true})
    // `createIfNotExists` makes duplicate writes of the same id harmless, which
    // covers both a retry after a lost response and two concurrent calls with
    // the same comment id.
    const created = await client.createIfNotExists(payload, {tag: 'comments.create'})
    state.set('receiveComment', receiveComment(commentsKey, created))
    return normalizeComment(created)
  } catch (error) {
    // Keep it on screen carrying the failure, so an app can offer a retry with
    // the same id rather than silently losing what someone typed.
    state.set(
      'setCommentCreateError',
      setCommentCreateError(payload._id, error instanceof Error ? error : new Error(String(error))),
    )
    throw error
  }
}

/**
 * Starts a thread on a document, or on one of its fields.
 *
 * Creates the project's comments dataset if this is the first comment anywhere
 * in it. The comment appears locally before the server confirms it; if the
 * write fails it stays, carrying `_state.createError`, and retrying with the
 * same `commentId` replaces it.
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
    const perspective = options.perspective ?? instance.config.perspective
    const fieldPath = requireFieldPath(options.fieldPath)

    return postComment(
      context,
      options,
      buildCommentPayload({
        authorId: requireCurrentUserId(instance),
        commentId: options.commentId ?? crypto.randomUUID(),
        contentSnapshot: options.contentSnapshot,
        context: options.context,
        documentRevisionId: options.documentRevisionId,
        handle: options,
        message: options.message,
        resource: assertDatasetResource(key.resource),
        fieldPath,
        selection: options.selection,
        status: options.status ?? 'open',
        threadId: options.threadId ?? crypto.randomUUID(),
        ...(isReleasePerspective(perspective) ? {documentVersionId: perspective.releaseName} : {}),
      }),
    )
  },
)

/**
 * Adds a reply to an existing thread.
 *
 * The thread and field are taken from the parent comment, so a reply always
 * matches the same list as the comment it answers. Supply them only when the
 * parent is not loaded.
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
    const commentsKey = getCommentsKey(toCommentsKeyParts(instance, options))
    const parent = findComment(state, commentsKey, options.parentCommentId)

    const threadId = options.threadId ?? parent?.threadId
    if (!threadId) {
      throw new Error(
        `Cannot reply to "${options.parentCommentId}": it is not loaded, so pass its threadId.`,
      )
    }

    const status = parent?.status ?? options.status
    if (!status) {
      throw new Error(
        `Cannot reply to "${options.parentCommentId}": it is not loaded, so pass its status.`,
      )
    }

    const perspective = options.perspective ?? instance.config.perspective

    return postComment(
      context,
      options,
      buildCommentPayload({
        authorId: requireCurrentUserId(instance),
        commentId: options.commentId ?? crypto.randomUUID(),
        handle: options,
        message: options.message,
        // Replies to a reply belong to the thread's first comment, matching how
        // the Studio flattens threads.
        parentCommentId: parent?.parentCommentId ?? options.parentCommentId,
        resource: assertDatasetResource(key.resource),
        // Inherited from the parent unless the caller names one, and checked
        // either way: a reply with no path crashes the Studio inspector exactly
        // as a pathless thread would.
        fieldPath: requireFieldPath(options.fieldPath ?? parent?.target.path?.field ?? ''),
        // A reply into a resolved thread stays consistent with its parent.
        status,
        threadId,
        ...(isReleasePerspective(perspective) ? {documentVersionId: perspective.releaseName} : {}),
      }),
    )
  },
)

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
    {state, instance, key}: StoreContext<CommentsStoreState, BoundResourceKey>,
    {commentId, message}: UpdateCommentOptions,
  ) => {
    const lastEditedAt = new Date().toISOString()
    const transactionId = crypto.randomUUID()
    const previous = findCommentById(state, commentId)

    if (previous) {
      state.set('setPendingTransaction', setPendingTransaction(commentId, transactionId))
      state.set('updateComment', applyCommentUpdate(commentId, {message, lastEditedAt}))
    }

    try {
      const client = await getWritableClient(instance, key.resource, {createIfMissing: false})
      await client
        .transaction()
        .transactionId(transactionId)
        .patch(client.patch(commentId).set({message, lastEditedAt}))
        .commit({tag: 'comments.update'})
      if (previous) {
        state.set('clearPendingTransaction', clearPendingTransaction(commentId))
      }
    } catch (error) {
      if (previous) {
        state.set(
          'rollbackCommentUpdate',
          rollbackCommentUpdate(commentId, transactionId, previous),
        )
      }
      throw error
    }
  },
)

/**
 * Resolves or reopens a thread.
 *
 * Pass the thread's first comment: replies follow it, patched server-side in
 * one query so a reply created by someone else at the same moment is caught
 * too.
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
    {commentId, status}: SetCommentStatusOptions,
  ) => {
    const transactionId = crypto.randomUUID()
    const previousComments: StoredComment[] = []

    for (const entry of Object.values(state.get().entries)) {
      for (const candidate of Object.values(entry?.comments ?? {})) {
        if (candidate._id !== commentId && candidate.parentCommentId !== commentId) continue
        previousComments.push(candidate)
        state.set('setPendingTransaction', setPendingTransaction(candidate._id, transactionId))
        state.set('updateCommentStatus', applyCommentUpdate(candidate._id, {status}))
      }
    }

    try {
      const client = await getWritableClient(instance, key.resource, {createIfMissing: false})

      await client.mutate(
        [
          {patch: {id: commentId, set: {status}}},
          {
            patch: {
              query: '*[_type == "comment" && parentCommentId == $commentId]',
              params: {commentId},
              set: {status},
            },
          },
        ],
        {transactionId, tag: 'comments.set-status'},
      )
      for (const previous of previousComments) {
        state.set('clearPendingTransaction', clearPendingTransaction(previous._id))
      }
    } catch (error) {
      for (const previous of previousComments) {
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
    {commentId}: RemoveCommentOptions,
  ) => {
    const removed = Object.entries(state.get().entries).flatMap(([entryKey, entry]) => {
      const comments = Object.values(entry?.comments ?? {}).filter(
        (comment) => comment._id === commentId || comment.parentCommentId === commentId,
      )
      return comments.length ? [{key: entryKey, comments}] : []
    })

    state.set('removeComment', removeCommentById(commentId))

    try {
      const client = await getWritableClient(instance, key.resource, {createIfMissing: false})
      await client.mutate(
        [
          {
            delete: {
              query: '*[_type == "comment" && parentCommentId == $commentId]',
              params: {commentId},
            },
          },
          {delete: {id: commentId}},
        ],
        {tag: 'comments.remove'},
      )
    } catch (error) {
      state.set('restoreComments', restoreComments(removed))
      throw error
    }
  },
)
