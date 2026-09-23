---
'@sanity/sdk-react': patch
---

The `useEditDocument` React hook now prevents clients from editing the `_system` field, which is prohibited by Content Lake.
