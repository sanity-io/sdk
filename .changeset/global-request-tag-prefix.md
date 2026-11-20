---
'@sanity/sdk': minor
---

Add `requestTagPrefix` to `SanityConfig` so apps can append a segment under `sanity.sdk` for all outgoing API requests, including auth and presence. For example, setting `requestTagPrefix: 'workbench'` sends tags like `sanity.sdk.workbench.<tag>` and `sanity.sdk.workbench.auth.<tag>`.
