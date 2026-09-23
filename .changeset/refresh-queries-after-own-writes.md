---
'@sanity/sdk': patch
---

Refetch active queries as soon as the server acknowledges a document action from this client that does more than edit, such as a create, publish, or delete, instead of waiting about a second for the Live Content API event. Plain edits and Live Content API updates work as before.
