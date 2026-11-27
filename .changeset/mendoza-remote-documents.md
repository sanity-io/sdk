---
'@sanity/sdk': patch
---

Documents edited by someone else now always show what Content Lake stored. The document store builds its copy of each document from the listener's Mendoza effects instead of re-applying the incoming patches itself, which could leave the copy different from the stored document (for example after a `merge` patch, or a patch that inserts an array item and edits text in the same request).
