---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Explain what to do when the signed-in account isn't a member of the project a request was made
against. `useQuery`, `useDocuments`, and `usePaginatedDocuments` now throw this
`projectUserNotFoundError` with a message that names the sign-in method, such as Google or SSO,
and tells the user to sign in with the account that has access. It replaces the API's
`project user not found for user ID ...` message, so error boundaries that render
`error.message` show the explanation. When no app error boundary catches the error, the SDK's
error screen shows the signed-in account, explains that each sign-in method is a separate
account, and offers to sign out and switch accounts in standalone apps.

Call `getProjectAccessErrorProjectId(error)` in an app error boundary to read the ID of the
project that rejected the request, and rethrow the error when the app can't work without that
project to show the SDK's error screen instead.
