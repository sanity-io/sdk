---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

`useApplications` now lists installations and local dev-server applications alongside studios and core apps in one shape: `type` distinguishes `'studio' | 'coreApp' | 'installation'`, `isLocal` marks dev-server applications, and installations keep their raw record under `installation`. The `applications.list` topic carries `Application | LocalApplication | Installation` records, so code reading the topic directly must narrow on `'type' in record`, and code reading `activeDeployment` or `config` off `useApplications()` entries must narrow on `type !== 'installation'` first.
