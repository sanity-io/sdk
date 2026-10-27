---
'@sanity/sdk': patch
'@sanity/sdk-react': patch
---

Projection results from `useDocumentProjection`, `getProjectionState`, and `resolveProjection` now type the `_status` field the SDK adds to every result. `DocumentStatus` is exported for typing it.
