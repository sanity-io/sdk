---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Views from `useView`, `usePanel`, `useTile` and `useAssetSource` carry their full `application`, views and web workers carry a flat `entry`, and `useView` also returns window views. `ViewApplication`, `DashboardApplicationBase`, `Dock` and `view.module` are removed from `@sanity/sdk/dashboard`.
