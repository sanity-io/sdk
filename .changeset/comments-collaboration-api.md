---
'@sanity/sdk': major
'@sanity/sdk-react': major
---

Move comments to the organization collaboration API ([#1181](https://github.com/sanity-io/sdk/pull/1181))

Comments no longer live in a `comments` add-on dataset. They live in an organization store, reached through the collaboration comments API, so there is nothing to provision and the SDK and the Studio read the same comments.

Breaking changes:

- Comments require `collaboration.organizationId`, on the Sanity config or per call.
- `getCommentThreadsState`, `resolveCommentThreads`, and `useCommentThreads` are renamed to `getDocumentCommentsState`, `resolveDocumentComments`, and `useDocumentComments`.
- `getCommentsState`, `resolveComments`, and `useComments` are removed. Read threads with `useDocumentComments`, or pass a GROQ filter to the new `useCommentsQuery`.
- `replyToComment` no longer takes a document handle; everything placing a reply is read off the parent.
- `@sanity/client` is now required at `^8.3.0`.

Also adds reactions, inline comment re-anchoring, a `variants` option for reading across a document's versions, an `error` on the comment hooks for when live updates stop, and `useUsersWithGrants` for building mention pickers.
