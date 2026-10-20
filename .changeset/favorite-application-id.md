---
'@sanity/sdk': minor
---

Each `Favorite` in `favorites.documents` carries its `id`, `createdAt`, `updatedAt`, `metadata.path` and the `application` it was favorited in (with `workspaceName` for studios), with the `FavoriteDocument` under `document`, addressed like Comlink's favorite messages. A studio document's resource type is `studio` on the bus, as over Comlink.
