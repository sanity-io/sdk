---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

`createDocumentHandle`, `createDocumentTypeHandle`, and `createDatasetHandle` return `projectId`
and `dataset` as required when both are passed as strings. Reading
`createDocumentHandle({projectId: 'abc123', dataset: 'production', ...}).projectId` is now typed
`'abc123'` instead of `'abc123' | undefined`. Handles that omit either field, or pass one typed
`string | undefined`, return the same type as before.

A variable, `useState` value, or React context whose type is inferred from one of these handles
now requires both fields. Assigning, comparing, or providing a handle whose `projectId` and
`dataset` are optional, such as a `DocumentHandle` prop or a `useDocuments` result, no longer
compiles, and neither does setting either field to `undefined`. Annotate the type with the
project and dataset to accept those handles and keep Typegen inference, for example
`useState<DocumentHandle<'author', 'production', 'abc123'>>(createDocumentHandle(...))`.
