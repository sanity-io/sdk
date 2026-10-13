---
'@sanity/sdk': patch
'@sanity/sdk-react': patch
---

`createDocumentHandle`, `createDocumentTypeHandle`, and `createDatasetHandle` keep `projectId` and `dataset` as literal types when called inline where a typed handle is expected, such as a prop typed `DocumentHandle<'movie', 'production', 'abc123'>`, a variable annotated with that type, or `useState<DocumentHandle<…>>(createDocumentHandle(…))`. In 3.9.0 these inferred `string` and failed to compile.
