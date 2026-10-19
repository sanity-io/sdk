---
'@sanity/sdk': patch
---

Retry user lookups that failed with a 401 or 403 once the token changes, and retry network and server errors before reporting them.
