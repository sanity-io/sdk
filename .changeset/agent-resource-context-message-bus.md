---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

`useAgentResourceContext` works in both Dashboard runtimes. Under the message bus it publishes the new `applications.context.update` topic instead of the Comlink event. A new `useApplicationContext` hook publishes what an application is currently showing, and new `applications.context` and `applications.context.update` topics carry it.
