---
'@sanity/sdk': patch
---

Refetch users when the token changes, including after a 401 or 403, and retry network and server errors before reporting them.
