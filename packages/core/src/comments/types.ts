import {type PortableTextBlock} from '@sanity/types'

/**
 * Whether a thread is still being discussed or has been closed out.
 * @beta
 */
export type CommentStatus = 'open' | 'resolved'

/**
 * The body of a comment, as Portable Text.
 *
 * Mentions appear here as inline objects of type `mention` carrying a `userId`.
 * The SDK stores and returns them untouched, so a mention written in the Studio
 * survives a round trip, but there is no API for composing one yet.
 * @beta
 */
export type CommentMessage = PortableTextBlock[] | null

/**
 * One block touched by a text selection, and that block's text with the
 * selection boundaries marked.
 *
 * `text` is the block's *entire* plain text with two private-use sentinel
 * characters (U+F000 and U+F001) inserted where the selection starts and ends.
 * Storing marked-up text rather than character offsets is what lets a highlight
 * survive edits elsewhere in the same block.
 * @beta
 */
export interface CommentTextSelectionItem {
  _key: string
  text: string
}

/**
 * A comment anchored to a run of text inside a Portable Text field.
 *
 * The SDK passes this through untouched. Resolving it back to a position in a
 * live editor needs the editor's current value, so that lives in
 * `@portabletext/plugin-sdk-value` rather than here.
 * @beta
 */
export interface CommentTextSelection {
  type: 'text'
  value: CommentTextSelectionItem[]
}

/**
 * An emoji reaction on a comment.
 *
 * Read only for now: a reaction added in the Studio shows up here, but there is
 * no action for adding or removing one.
 * @beta
 */
export interface CommentReaction {
  shortName: string
  userId: string
  addedAt: string
}

/**
 * Why a comment is not yet on the server.
 *
 * Local only, never written. Present on a comment whose create request failed,
 * so an app can offer a retry.
 * @beta
 */
export type CommentLocalState = {type: 'createError'; error: Error} | {type: 'createRetrying'}

/**
 * A single comment.
 *
 * Deliberately not the stored document. Comments are moving from per-dataset
 * addon datasets to an organization-level store, and the two disagree on the
 * document type, on how the commented document is referenced, and on where the
 * author is recorded. Everything here reads the same on both sides, so an app
 * written against this survives the move.
 *
 * Threads are flat: every comment in a thread shares a `threadId`, the thread's
 * first comment has no `parentCommentId`, and replies carry that first comment's
 * `id`. Use {@link CommentThread} to work with them grouped.
 *
 * @beta
 */
export interface Comment {
  id: string
  createdAt: string
  /**
   * Who wrote it.
   *
   * Absent when the server carries the author instead of the document. The
   * Studio's comments dataset stores it on the document, so it is present on
   * everything written today, but an agent-authored comment records
   * attribution elsewhere. Render a fallback rather than assuming a user id.
   */
  authorId?: string
  message: CommentMessage
  threadId: string
  /** Absent on the comment that starts a thread. */
  parentCommentId?: string
  status: CommentStatus
  /** Set once the message has been rewritten. */
  lastEditedAt?: string
  /** The document the thread hangs on, always the published id. */
  documentId: string
  documentType: string
  /** The field the thread hangs off, for example `title`. */
  fieldPath: string
  /** Set when the comment is anchored to a run of text in a Portable Text field. */
  selection?: CommentTextSelection
  /** A copy of the content the comment was written about. */
  contentSnapshot?: unknown
  reactions: CommentReaction[]
  /** Local only. Present while a create is failing or being retried. */
  state?: CommentLocalState
}

/**
 * A thread: one comment plus its replies.
 *
 * Unlike the Studio, the SDK returns every thread it finds. The Studio hides
 * threads whose field is gone from the schema or hidden by a conditional, which
 * it can do because it has the schema. Check `fieldPath` yourself if your app
 * needs the same behaviour.
 * @beta
 */
export interface CommentThread {
  threadId: string
  /** The field the thread hangs off, taken from its first comment. */
  fieldPath: string
  parentComment: Comment
  /** Oldest first. */
  replies: Comment[]
  /** The parent plus its replies. */
  commentsCount: number
  /** Taken from the parent comment; replies follow it. */
  status: CommentStatus
  /** `createdAt` of the most recent comment in the thread. */
  lastActivityAt: string
}

/**
 * Where in a document a thread hangs, as stored.
 * @internal
 */
interface StoredCommentPath {
  field: string
  selection?: CommentTextSelection
}

/**
 * Ambient information the Studio records about where a comment was written.
 *
 * Written for the notification backend and read by nothing in the Studio UI.
 * Not surfaced on {@link Comment}: the organization-level store types this as a
 * free-form object, so nothing about the shape is worth promising.
 *
 * @internal
 */
interface StoredCommentContext {
  tool: string
  payload?: Record<string, unknown>
  notification?: {
    documentTitle: string
    url?: string
    workspaceTitle: string
    workspaceName: string
    currentThreadLength?: number
    subscribers?: string[]
  }
  intent?: {
    title: string
    name: string
    params: Record<string, unknown>
  }
}

/**
 * A reaction as stored, including the array key.
 * @internal
 */
interface StoredCommentReaction extends CommentReaction {
  _key: string
}

/**
 * What a stored comment points at.
 *
 * Comments live in a separate addon dataset, so `document` is a
 * `crossDatasetReference` back into the dataset holding the commented document.
 * It is deliberately weak: a strong reference would stop Content Lake deleting
 * the document it points at.
 *
 * @internal
 */
interface StoredCommentTarget {
  path?: StoredCommentPath
  documentRevisionId?: string
  documentVersionId?: string
  documentType: string
  document:
    | {
        _dataset: string
        _projectId: string
        _ref: string
        _type: 'crossDatasetReference'
        _weak: boolean
      }
    | {
        _ref: string
        _type: 'reference'
        _weak: boolean
      }
}

/**
 * A comment exactly as the Studio stores it.
 *
 * Internal on purpose. This is the addon dataset's shape, and it changes when
 * comments move to the organization-level store. {@link Comment} is what
 * consumers get.
 *
 * @internal
 */
export interface StoredComment {
  _type: 'comment'
  _id: string
  _createdAt: string
  _rev: string

  /** Local only. Never written to the server. */
  _state?: CommentLocalState

  authorId: string
  message: CommentMessage
  threadId: string
  parentCommentId?: string
  status: CommentStatus
  lastEditedAt?: string
  reactions: StoredCommentReaction[] | null
  context?: StoredCommentContext
  contentSnapshot?: unknown
  target: StoredCommentTarget
}

/**
 * What gets written when a comment is created.
 * @internal
 */
export type CommentPostPayload = Omit<StoredComment, '_rev' | '_createdAt' | '_state'>
