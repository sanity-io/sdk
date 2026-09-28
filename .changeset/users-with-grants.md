---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

`useUsersWithGrants` (and `getUsersWithGrantsState` / `resolveUsersWithGrants` / `loadMoreUsersWithGrants` on `@sanity/sdk`) read a project's users and annotate each with whether they can read a document, by evaluating the dataset's `system.group` filters. Users who cannot are returned carrying `granted: false` rather than dropped, so a mention picker can show them as unavailable.

`users.list` now passes through `displayName`, `email`, `sortBy`, and `orderBy`, so a picker can search server-side instead of paging the whole list. A project membership also carries `resourceUserId`, the id a dataset's access groups know a user by.
