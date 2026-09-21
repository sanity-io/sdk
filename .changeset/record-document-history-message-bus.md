---
'@sanity/sdk-react': minor
'@sanity/sdk': minor
---

`useRecordDocumentHistoryEvent` works in both Dashboard runtimes. Under the message bus it reports document activity over the new `applications.activity` topic, requires `resourceId`, and no-ops when the host does not provide the `history` capability. The Comlink behaviour and the public signature are unchanged.
