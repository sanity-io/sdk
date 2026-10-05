---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

`defineProjection` accepts the document type as an optional first argument, as in
`defineProjection('book', '{title}')`, and still returns the projection string unchanged.
Typegen evaluates a projection that names its document type for that type only, instead of for
every document type in the schema. `useDocumentProjection` with a handle whose document type is
only known as `string`, such as one from `useDocuments` called without a literal document type,
now resolves to the projection's result across the document types it was generated for, instead
of `never`.
