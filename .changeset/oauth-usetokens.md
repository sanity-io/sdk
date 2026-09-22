---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Add the `useOAuthTokens` hook exposing stored OAuth token state with `refresh` and `revoke`. The public OAuth token surface (`getOAuthTokensState`, `refreshOAuthTokens`, and the hook) now omits the refresh token, which core retains internally for refreshing. ([#1213](https://github.com/sanity-io/sdk/pull/1213))
