// Comments backed by the organization collaboration API, in beta.
//
// The subpath exists so these can ship beside the deprecated add-on dataset
// comment APIs on the package root, which carry the same names. In the next
// major those go away and these become the root exports;
// `@sanity/sdk/collaboration` keeps re-exporting them in that major, marked
// `@deprecated`, and is removed in the major after.

export {buildCommentThreads} from '../comments/buildCommentThreads'
export {
  addReaction,
  createComment,
  type CreateCommentOptions,
  type ReactionOptions,
  removeComment,
  type RemoveCommentOptions,
  removeReaction,
  replyToComment,
  type ReplyToCommentOptions,
  setCommentStatus,
  type SetCommentStatusOptions,
  updateComment,
  updateCommentAnchor,
  type UpdateCommentAnchorOptions,
  type UpdateCommentOptions,
} from '../comments/commentActions'
export {
  type CommentsOptions,
  type CommentsQueryOptions,
  type CommentsReadScope,
  type ResolveCommentsOptions,
  type ResolveCommentsQueryOptions,
} from '../comments/commentsOptions'
export {
  getCommentsErrorState,
  getCommentsQueryErrorState,
  getCommentsQueryState,
  getCommentsState,
  getCommentThreadsState,
  resolveComments,
  resolveCommentsQuery,
  resolveCommentThreads,
} from '../comments/commentsStore'
export {
  type Comment,
  type CommentAnchor,
  type CommentFieldValue,
  type CommentLocalState,
  type CommentMessage,
  type CommentReaction,
  type CommentReactionShortName,
  type CommentStatus,
  type CommentTextSelection,
  type CommentTextSelectionItem,
  type CommentThread,
} from '../comments/types'
