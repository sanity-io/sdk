---
'@sanity/sdk': minor
---

Each favorite in `favorites.documents` carries the favorite's `id`, `createdAt`, `updatedAt`, `metadata.path` and the `application` it was favorited in (with `workspaceName` for studios), with the document under `document`, addressed like Comlink's favorite messages. A studio document's resource type is `studio` on the bus, as over Comlink.
