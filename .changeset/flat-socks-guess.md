---
'@sanity/sdk': major
'@sanity/sdk-react': major
---

SDK now integrates with Content Variants; `SanityApp`, `ResourceProvider`, and
`DatasetHandle` each accept a new `variant` property, reflecting a variant
definition id.

**Importantly,** documents loaded by SDK are no longer guaranteed to have the
`_id` field present. This is because variant documents don't have a
deterministic `_id`, meaning their `_id` is unknown when optimistically
created by SDK. The `_id` field is populated as soon as Content Lake announces
it to the client.

If your application needs a stable string to refer to documents (e.g. to act as
a `key` in a React application), use the new `getDocumentKey` function. It
produces a deterministic, stable, and unique string representing the document.
