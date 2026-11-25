---
'@sanity/sdk': minor
---

Add two document events for consumers that apply `remote-patches` to their own state, like collaborative text editors.

- `remote-sync` is emitted when a document's server copy changed without patches for it: a fetched snapshot (the first load, a reconnect, a gap in the revision chain), or a create or delete. Reload the document instead of applying patches.
- `edit-no-op` is emitted, with `experimental_documentSync`, when an accepted edit changed nothing in some operations because their target was gone by the time Content Lake applied them, for example a text edit inside a block someone else deleted. Each entry names the operation, its path and the reason. Before this, the edit was lost without notice.
