---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Add `organizationId` to the Sanity config for apps running outside the Dashboard. Organization user lists use it, and `AuthBoundary` checks it against each project's organization the way it already checks the Dashboard's.
