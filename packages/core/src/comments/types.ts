import {
  type CollaborationCommentDocument,
  type CollaborationCommentRange,
  type CollaborationCommentReactionShortName,
} from '@sanity/client'
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
export type CommentMessage = PortableTextBlock[]

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
 * Resolved by the API when a comment is written, from the {@link CommentRange}
 * it was given. Read only: re-anchoring goes through `updateCommentRange`.
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
 * Where a comment attaches inside a Portable Text field, as an offset into each
 * end of the run of text it covers.
 *
 * This is the write side of {@link CommentTextSelection}: pass a range when
 * creating or re-anchoring a comment, and read the selection the API resolved
 * it into.
 * @beta
 */
export type CommentRange = CollaborationCommentRange

/**
 * The emoji a reaction can be, by short name.
 *
 * A closed set rather than an arbitrary string: the API rejects anything else.
 * @beta
 */
export type CommentReactionShortName = CollaborationCommentReactionShortName

/**
 * An emoji reaction on a comment.
 * @beta
 */
export interface CommentReaction {
  shortName: CommentReactionShortName
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
 * Deliberately not the stored document: this stays put while the comment API's
 * own shape moves, and it flattens away the parts of the stored shape that
 * exist for storage rather than for reading — the global document reference,
 * the array keys on reactions, the nested target.
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
   * Absent when the server records attribution elsewhere, as it does for an
   * agent-authored comment. Render a fallback rather than assuming a user id.
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
  /**
   * The exact document id the comment was written against: a published id, a
   * draft id, or a version id.
   *
   * `documentId` groups a document's variants into one thread list; this tells
   * them apart, which matters when reading across variants.
   */
  sourceDocumentId: string
  documentType: string
  /** The field the thread hangs off, for example `title`. */
  fieldPath: string
  /** Set when the comment is anchored to a run of text in a Portable Text field. */
  selection?: CommentTextSelection
  /**
   * A copy of the content the comment was written about, resolved by the API
   * when the comment was created. Inline comments only, and only the part of
   * each block the selection covers.
   */
  contentSnapshot?: CommentMessage
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
 * A comment as the API stores it, plus the local-only state the store keeps
 * beside it.
 *
 * Internal on purpose: this is the API's shape, and it moves with the API.
 * {@link Comment} is what consumers get.
 *
 * @internal
 */
export type StoredComment = CollaborationCommentDocument & {
  /** Local only. Never written to the server. */
  _state?: CommentLocalState
}
