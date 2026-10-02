---
'@sanity/sdk-react': patch
---

`useDocumentProjection` keeps its subscription when a component re-renders with a handle that has the same values, such as handles from a refetched `useDocuments` list.
