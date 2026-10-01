// Comment hooks backed by the organization collaboration API, in beta.
//
// The subpath exists so these can ship beside the deprecated add-on dataset
// comment hooks on the package root, which carry the same names. In the next
// major those go away and these become the root exports, with
// `@sanity/sdk-react/collaboration` kept as an alias so imports written now
// keep working.

export {type CommentActions, useCommentActions} from '../hooks/comments/useCommentActions'
export {useComments, type UseCommentsResult} from '../hooks/comments/useComments'
export {useCommentsQuery, type UseCommentsQueryResult} from '../hooks/comments/useCommentsQuery'
export {useCommentThreads, type UseCommentThreadsResult} from '../hooks/comments/useCommentThreads'
export * from '@sanity/sdk/collaboration'
