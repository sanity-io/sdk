---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Dashboard views and web workers share one set of types, exported from `@sanity/sdk/dashboard`. A view returned on its own, from `useView`, `usePanel`, `useTile` or `useAssetSource`, has `surface` instead of `type` and carries its `application`. A view listed under an application on `useApplications` has the same shape without `application`. `ApplicationInterface` metadata matches the Applications API: `app` and `panel` interfaces carry an optional `icon`, an `app` dock `group` is `'system'` or `'applications'`, and a `panel` dock has only `order`.
