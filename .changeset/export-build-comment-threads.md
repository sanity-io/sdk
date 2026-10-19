---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

`buildCommentThreads` is exported from `@sanity/sdk/collaboration` and `@sanity/sdk-react/collaboration`. It groups a flat `Comment[]` into `CommentThread[]` the same way `useCommentThreads` does, so comments read with `useCommentsQuery`, for example across several documents in one query, can be threaded without copying the SDK's code.
