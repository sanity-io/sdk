---
title: TypeScript with TypeGen (beta)
---

# Using TypeGen with the Sanity SDK (beta)

[Sanity TypeGen](https://www.sanity.io/docs/sanity-typegen) generates types from your
schemas and GROQ queries. The SDK supports two ways to use those types:

| Setup                                | How hooks receive their types                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Current TypeGen                      | Import generated types and pass them as hook generics.                                                           |
| Existing experimental TypeGen output | Keep the generated file to preserve document, query, and projection inference. Follow the migration steps below. |

The SDK now depends on released `groq` instead of the experimental fork. This removes
that experimental package from the SDK's runtime dependencies. It does not add automatic
hook inference for current TypeGen output or change how hooks fetch and update data.

## Current TypeGen

Follow [Migrating from experimental TypeGen in App SDK](https://www.sanity.io/docs/app-sdk/migrating-from-experimental-typegen-in-app-sdk)
for schema extraction and generation setup. Extract the schema in your Studio, then
make the resulting `schema.json` available to TypeGen in your app.

Define queries with `defineQuery` from released `groq`. Install it directly in your app
if your code imports it:

```bash
pnpm add groq@^6.12.0
```

The generator scans `defineQuery` calls to produce query result types. Pass those types
to SDK hooks explicitly:

```tsx
import {useDocument, useQuery, type DocumentHandle} from '@sanity/sdk-react'
import {defineQuery} from 'groq'

import type {Book, AllBooksResult} from './sanity.types'

export const allBooks = defineQuery('*[_type == "book"]{_id, title}')

function BookTitle({doc}: {doc: DocumentHandle<'book'>}) {
  const {data: book} = useDocument<Book>(doc)
  return <h1>{book?.title ?? 'Untitled'}</h1>
}

function BookList() {
  const {data} = useQuery<AllBooksResult>({query: allBooks})
  return (
    <ul>
      {data.map((book) => (
        <li key={book._id}>{book.title}</li>
      ))}
    </ul>
  )
}
```

`AllBooksResult` is generated from the `allBooks` query. Run generation after changing
the query or schema. When using multiple datasets, generate a file for each schema and
import the type for the dataset the hook reads.

Current TypeGen does not generate projection types. Supply a result type yourself, or
use a full query with `defineQuery` and its generated result type:

```tsx
import {useDocumentProjection, type DocumentHandle} from '@sanity/sdk-react'

type BookPreview = {title: string | null}

function BookCard({doc}: {doc: DocumentHandle<'book'>}) {
  const {data} = useDocumentProjection<BookPreview>({...doc, projection: '{title}'})
  return <span>{data?.title}</span>
}
```

## Migrating an existing experimental setup

Existing generated files import helper types such as `SchemaOrigin` from `groq`.
The SDK supplies compatibility declarations for those imports. This preserves the old
lookup behavior while your app uses released `groq`.

This migration requires dependency and import changes:

1. Keep a copy of your existing `sanity.types.ts`. Stop any install or build script that
   regenerates it with the experimental CLI.
2. Replace your direct experimental `groq` dependency with released `groq`:

   ```bash
   pnpm add groq@^6.12.0
   ```

3. Remove the experimental CLI dependency, including any alias used to install it beside
   the current CLI. Keep the current CLI if other commands use it.
4. Change projection imports. Both SDK packages export the replacement helper:

   ```diff
   - import {defineProjection} from 'groq'
   + import {defineProjection} from '@sanity/sdk-react'
   ```

   `defineQuery` continues to come from `groq`. Keep existing query and projection strings
   unchanged so they match the entries in your saved generated file.

5. Check your dependency tree and typecheck the app:

   ```bash
   pnpm why groq
   pnpm exec tsc --noEmit
   ```

Your generated file and the SDK must resolve the same released `groq` declarations.
Matching version ranges help, but a lockfile or override can still keep separate versions.
If inference disappears or TypeScript reports missing helper exports, align the app and
SDK versions and update the lockfile. Keeping the experimental fork alongside released
`groq` is unsupported: depending on resolution, it can cause declaration conflicts or
silently lose inference.

### Updating schemas or projections after migration

The saved file describes the schemas and queries from its last generation. It does not
stay current automatically. The experimental generator does not recognize
`defineProjection` imported from the SDK, and current TypeGen does not generate these
projection declarations either.

To resume generation, use current TypeGen and pass generated types explicitly as shown
above. Replacing the old file removes its automatic hook inference. Update the affected
hook calls as part of that migration, and supply explicit types for projections.

Do not install the experimental packages in a new app. The
[older experimental guide](https://www.sanity.io/docs/app-sdk/sdk-typegen) describes the
previous setup and is retained for reference.

## Inference with a saved experimental file

The following example assumes the saved generated file already registers the book schema
for `example.production` and the exact projection string `{title}`:

```tsx
import {
  createDocumentHandle,
  defineProjection,
  useDocument,
  useDocumentProjection,
} from '@sanity/sdk-react'

const bookHandle = createDocumentHandle({
  projectId: 'example',
  dataset: 'production',
  documentId: 'book-1',
  documentType: 'book',
})
const preview = defineProjection('{title}')

function BookCard() {
  const {data: book} = useDocument(bookHandle)
  const {data: summary} = useDocumentProjection({...bookHandle, projection: preview})
  return <span>{summary?.title ?? book?.title ?? 'Untitled'}</span>
}
```

The handle records the document type and dataset. Keep those values as literal types
when passing handles through component props if you need to distinguish the same document
type across datasets. `createDocumentHandle` captures them; a plain object can use
`as const`.

Legacy inference has limitations. For example, field-path reads can return a union of
field types across datasets. A widened or unregistered query can also resolve to the
union of registered query results. Use an explicit result type when a query is built at
runtime or when you need more precise types than the legacy lookup provides.

Without a generated file, use explicit hook generics. Runtime fetching works the same;
automatic inference requires the corresponding generated declarations.
