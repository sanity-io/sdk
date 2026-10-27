---
'@sanity/sdk-react': minor
---

`urlFor.studios(id).workspace()` takes the workspace and links to its `basePath` instead of its name, so a workspace whose base path differs from its name, such as `default` at `/`, links to the right path.
