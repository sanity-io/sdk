---
'@sanity/sdk': patch
'@sanity/sdk-react': patch
---

Reject persisted OAuth tokens with an unparseable `expiresAt`, and refresh persisted tokens that expired while the app was closed instead of starting with a dead access token ([#1234](https://github.com/sanity-io/sdk/pull/1234))
