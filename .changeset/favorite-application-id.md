---
'@sanity/sdk': minor
---

Each favorite in `favorites.documents` carries `applicationId`, the application it was favorited in, so a favorite opens in the right studio when several studios share its dataset and workspace name. Hosts must set it; `favorites.update` takes the document without it.
