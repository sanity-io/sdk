---
'@sanity/sdk': patch
---

Prevent an inaccessible document from breaking reads for other documents in the same dataset, and report an inaccessible draft to the document that reads it. `useDocument` and `useDocumentSyncStatus` now throw for a document the reader cannot read, where they used to load forever or report it as synced.
