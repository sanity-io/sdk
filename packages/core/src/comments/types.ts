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
 * Where in a document a thread hangs.
 * @beta
 */
export interface CommentPath {
  /**
   * A stringified field path, for example `title` or
   * `body[_key=="intro"].content`. Empty for a document-level thread.
   */
  field: string
  selection?: CommentTextSelection
}

/**
 * Ambient information about where a comment was written.
 *
 * Written by the Studio for its notification backend and read by nothing in the
 * Studio UI. The SDK fills in what it can and omits the rest; see the remarks on
 * {@link CreateCommentOptions.context}.
 * @beta
 */
export interface CommentContext {
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
 * An emoji reaction on a comment.
 *
 * The SDK reads these so a reaction added in the Studio is visible, but has no
 * action for adding or removing one.
 * @beta
 */
export interface CommentReactionItem {
  _key: string
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
 * What a comment points at.
 *
 * Comments live in a separate addon dataset, so `document` is a
 * `crossDatasetReference` back into the dataset holding the commented document.
 * It is deliberately weak: a strong reference would stop Content Lake deleting
 * the document it points at.
 * @beta
 */
export interface CommentTarget {
  path?: CommentPath
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
 * A single comment, exactly as the Studio stores it.
 *
 * Threads are flat: every comment in a thread shares a `threadId`, the thread's
 * first comment has no `parentCommentId`, and replies carry the first comment's
 * `_id`. Use {@link CommentThread} to work with them grouped.
 * @beta
 */
export interface CommentDocument {
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
  reactions: CommentReactionItem[] | null
  context?: CommentContext

  /** A copy of the content the comment was written about. */
  contentSnapshot?: unknown

  target: CommentTarget
}

/**
 * What gets written when a comment is created.
 * @beta
 */
export type CommentPostPayload = Omit<CommentDocument, '_rev' | '_createdAt' | '_state'>

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
  /** Empty for a document-level thread. */
  fieldPath: string
  parentComment: CommentDocument
  /** Oldest first. */
  replies: CommentDocument[]
  /** The parent plus its replies. */
  commentsCount: number
  /** Taken from the parent comment; replies follow it. */
  status: CommentStatus
  /** `_createdAt` of the most recent comment in the thread. */
  lastActivityAt: string
}
