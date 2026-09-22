---
'@sanity/sdk': patch
---

Submit the first ready document transaction without a one-second batching delay. Continue batching repeated edits, and flush pending edits before publish and other non-batchable transactions while preserving submission order.
