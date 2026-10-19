---
'@sanity/sdk': patch
---

Retry fetching releases after a 401 or 403 once the token changes, instead of failing until reload.
