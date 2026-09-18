---
'@sanity/sdk-react': minor
---

`useNavigate` and `useNavigateToStudioDocument` work in both Dashboard runtimes. Under the message bus, `useNavigate` follows the `navigation.location` topic and its returned function reports in-app navigation back to the Dashboard; `useNavigateToStudioDocument` requests the studio edit intent over `navigation.location.update`. `MessageBusConnection` exposes `appId`.
