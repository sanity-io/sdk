---
'@sanity/sdk-react': minor
'@sanity/sdk': minor
---

Add the `applications.capabilities` state topic, the `Capability`, `CapabilityRecord`, and `capabilities` exports on `@sanity/sdk/dashboard`, and the `useCapabilities()` hook on `@sanity/sdk-react/dashboard` so an application can read the capabilities the host provides and hide its own implementation of anything the host provides.
