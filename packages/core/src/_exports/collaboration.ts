// Comments backed by the organization collaboration API, in beta.
//
// The subpath exists so these can ship beside the deprecated add-on dataset
// comment APIs on the package root, which carry the same names. In the next
// major those go away and these become the root exports, with
// `@sanity/sdk/collaboration` kept as an alias so imports written now keep
// working.

export {
  addReaction,
  type CommentAnchor,
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
  type UpdateCommentOptions,
  updateCommentRange,
  type UpdateCommentRangeOptions,
} from '../comments/commentActions'
export {
  type CommentsOptions,
  type CommentsQueryOptions,
  type CommentVariants,
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
  type CommentFieldValue,
  type CommentLocalState,
  type CommentMessage,
  type CommentRange,
  type CommentReaction,
  type CommentReactionShortName,
  type CommentStatus,
  type CommentTextSelection,
  type CommentTextSelectionItem,
  type CommentThread,
} from '../comments/types'
