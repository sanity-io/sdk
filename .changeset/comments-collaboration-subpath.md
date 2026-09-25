---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Comments backed by the organization collaboration API ship under `@sanity/sdk/collaboration` and `@sanity/sdk-react/collaboration`: `useDocumentComments` reads a document's threads, `useCommentsQuery` takes a GROQ filter for anything that is not one document's comments, and `useCommentActions` adds reactions and `updateCommentRange`. Reads require `collaboration.organizationId` on the config or per call, and `@sanity/client` 8.3 or newer.

The add-on dataset comment APIs stay where they are, unchanged, and are now deprecated: `useComments`, `useCommentThreads`, and `useCommentActions` on `@sanity/sdk-react`, and `getCommentsState`, `getCommentThreadsState`, `resolveComments`, `resolveCommentThreads`, and the write actions on `@sanity/sdk`. They are removed in the next major. Do not move to the collaboration subpath until the Studio serving your project reads the Comments API and your existing comments have been migrated into the organization store, or your app and your Studio will show different sets of comments. See the [Collaboration guide](https://github.com/sanity-io/sdk/blob/main/packages/react/guides/Collaboration.md#moving-from-the-add-on-dataset-hooks).
