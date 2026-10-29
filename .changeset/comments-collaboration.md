---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Add comments backed by the organization Comments API under `@sanity/sdk/collaboration` and `@sanity/sdk-react/collaboration`, in beta. The hooks keep the root names (`useComments`, `useCommentThreads`, `useCommentActions`) and add `useCommentsQuery` and `buildCommentThreads` for comments across documents, reactions, `updateCommentAnchor`, and comments on a whole document. See the [Collaboration guide](https://github.com/sanity-io/sdk/blob/main/packages/react/guides/Collaboration.md).

The comment APIs on the package roots, which read the add-on dataset, are deprecated and will be removed in the next major. Don't switch until your Studio reads the Comments API and your existing comments are migrated, or your app and your Studio will show different comments. See the [Migration guide](https://github.com/sanity-io/sdk/blob/main/packages/react/guides/0-Migration-Guide.md).
