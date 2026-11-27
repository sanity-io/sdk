---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Dashboard views and web workers carry their `application` and a flat `entry` wherever they are returned, and `useView` also returns window views. `ViewApplication`, `DashboardApplicationBase`, `Dock` and `view.module` are removed from `@sanity/sdk/dashboard`.
