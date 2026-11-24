---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Dashboard views and web workers share one set of types, exported from `@sanity/sdk/dashboard`. `useView`, `usePanel`, `useTile` and `useAssetSource` return a view with `surface` instead of `type`, plus its `application`, matching the views on `useApplications`.
