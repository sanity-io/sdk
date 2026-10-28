---
'@sanity/sdk': patch
---

Clear a failed read's error as soon as the token changes, so an error boundary that resets on the new token renders the retried read.
