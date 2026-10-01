---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Comments backed by the organization collaboration API ship under `@sanity/sdk/collaboration` and `@sanity/sdk-react/collaboration`. The names match the add-on dataset ones they replace, so moving over is a change of import: `useComments` reads a document's comments flat, `useCommentThreads` reads them grouped, and `useCommentActions` writes. New alongside them: `useCommentsQuery` takes a GROQ filter for anything that is not one document's comments, and `useCommentActions` adds reactions and `updateCommentAnchor`. Requires `@sanity/client` 8.8 or newer.

Comments are stored per organization. Inside the Sanity Dashboard that is the organization the app was opened in; standalone, it is `organizationId` on the Sanity config, or the organization owning the project if you set neither. You only have to configure it when your app is not in the Dashboard and the project's own organization is the wrong one.

The subpath is temporary. These APIs move to `@sanity/sdk` and `@sanity/sdk-react` in the next major, once the add-on dataset ones are gone; `/collaboration` stays as an alias so imports do not have to change again.

The add-on dataset comment APIs stay where they are, unchanged, and are now deprecated: `useComments`, `useCommentThreads`, and `useCommentActions` on `@sanity/sdk-react`, and `getCommentsState`, `getCommentThreadsState`, `resolveComments`, `resolveCommentThreads`, and the write actions on `@sanity/sdk`. They are removed in the next major. Do not move to the collaboration subpath until the Studio serving your project reads the Comments API and your existing comments have been migrated into the organization store, or your app and your Studio will show different sets of comments. See the [Collaboration guide](https://github.com/sanity-io/sdk/blob/main/packages/react/guides/Collaboration.md).
