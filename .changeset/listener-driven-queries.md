---
'@sanity/sdk': minor
'@sanity/sdk-react': patch
---

Improve update responsiveness for SDK queries and release metadata using shared mutation listeners. Rapid changes are grouped, and updates received during a fetch trigger a follow-up refresh.

SDK queries and release metadata now read directly from the API. The `useCdn` query option is deprecated and remains accepted for compatibility, but no longer enables CDN reads or creates a separate query cache entry.

Content changes, including draft edits, refresh all active queries in the affected resource. This may increase query traffic in apps with frequent writes or many active queries, even when query results do not change. Connecting a listener can also trigger an additional refresh to include changes made during initial loading.

Improve recovery after failed refreshes and ensure legacy `projectId` and `dataset` overrides consistently target the same resource for reads and updates.
