---
'@sanity/sdk': patch
---

Refreshing an OAuth access token keeps the signed-in user, so `useCurrentUser` no longer returns `null` while `/users/me` is fetched again.
