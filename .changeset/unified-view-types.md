---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Dashboard views and web workers share one set of types, exported from `@sanity/sdk/dashboard`. `useView`, `usePanel`, `useTile` and `useAssetSource` return a view with `surface` instead of `type`, plus its `application`, matching the views on `useApplications`. `ApplicationInterface` metadata matches the Applications API: `app` and `panel` interfaces carry an optional `icon`, an `app` dock `group` is `'system'` or `'applications'`, and a `panel` dock has only `order`.
