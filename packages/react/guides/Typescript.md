---
title: TypeScript with TypeGen (beta)
---

# Using TypeGen with the Sanity SDK (beta)

[Sanity TypeGen](https://www.sanity.io/docs/sanity-typegen) generates TypeScript types
from your schemas and GROQ queries. The SDK hooks read them, so `useQuery` returns the
shape your query selects and `useDocument` returns the document type your handle names.

What you get depends on how your app was set up, because the generation side is
mid-rebuild:

|                         | Set up with the experimental packages | New app, using `sanity typegen generate` |
| ----------------------- | ------------------------------------- | ---------------------------------------- |
| `useQuery`              | Typed                                 | Typed                                    |
| `useDocument`           | Typed                                 | Typed, after the bridge file below       |
| `useDocumentProjection` | Typed                                 | Not yet                                  |

The full setup lives in
[App SDK and TypeGen](https://www.sanity.io/docs/app-sdk/sdk-typegen). This guide covers
the parts specific to the SDK's hooks.

## Stability

TypeGen support in the App SDK is in beta. The hooks are not: `useDocument`, `useQuery`,
and `useDocumentProjection` are stable, and none of their runtime behavior changes here.
What is in beta is the type layer between your generated file and those hooks.

| Stable                                  | In beta                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| The hooks themselves                    | `defineProjection`'s home. It moves from `@sanity/sdk` to `groq` |
| `defineQuery`, from `groq`              | The `SanitySchemasByResource` interface name                     |
| Handles and the `create*Handle` helpers | `ResolveDocument` and its siblings                               |
| What you write in a component           | The bridge file, which gets deleted                              |

What you write stays as it is. What changes sits underneath it, so expect an import to
move and a hand-written file to become unnecessary, not a rewrite of your components.

"Experimental" in this guide means one thing only: the `groq@typegen-experimental-*` and
`@sanity/cli@typegen-experimental-*` packages, which you should not install.

## If your app used the experimental packages

Do not install `groq@typegen-experimental-*` or `@sanity/cli@typegen-experimental-*`.
The SDK depends on released `groq`, and installing the fork alongside it produces
duplicate type declarations.

Your existing `sanity.types.ts` keeps working. The SDK ships compatibility declarations
for the fork's helper types, so the file still compiles and still gives you typed
documents, queries, and projections. **Do not regenerate it**: `sanity typegen generate`
would replace it with a file that types `useQuery` and nothing else.

One import changes:

```diff
- import {defineProjection} from 'groq'
+ import {defineProjection} from '@sanity/sdk'
```

`defineQuery` still comes from `groq`.

## Setup in brief

Your app imports `defineQuery` from `groq`, so install it directly. The SDK depends on
it too, but a transitive dependency is not importable from your own code under pnpm's
default layout:

```bash
npm install groq@^6
```

Then extract the schema from your Studio project and generate:

```bash
npx sanity schema extract --workspace <workspace-name> --path schema.json
npx sanity typegen generate
```

Your app needs the `schema.json` file, not the `sanity` package. If you keep a
`sanity-typegen.json`, do not set `overloadClientMethods` to `false`; that flag
suppresses the module augmentation the SDK reads.

**Your app and the SDK must resolve the same copy of `groq`.** The SDK's compatibility
declarations attach to the `groq` directory its own types resolve to, so a second copy at
a different version leaves your generated file importing helpers from a copy that never
received them, and it fails with `TS2614: Module '"groq"' has no exported member
'SchemaOrigin'`. The `^6` range above is what keeps them deduped. Pinning `groq` to an
exact or older version is what splits it.

The same rule covers `@sanity/client`, which the bridge file below augments. A split there
is quieter: no error, just `never` everywhere.

Then add one file to connect the generated schema types to your dataset:

```typescript
// sanity.typegen-bridge.ts
import type {AllSanitySchemaTypes} from './sanity.types'

declare module '@sanity/client' {
  interface SanitySchemasByResource {
    'your-project-id.your-dataset': AllSanitySchemaTypes
  }
}
```

Add one entry per dataset. Pass the whole `AllSanitySchemaTypes` union; it includes
object types such as `slug` alongside your documents, and the SDK filters those out.
Delete this file once the multi-resource command generates the same declaration.

Three ways to get `never` out of this file, all silent at the declaration:

- **A wrong key.** `useDocument` on a handle with a literal `documentType` resolves to
  `never`, so every field access fails. Check the key against your `projectId.dataset`
  first.
- **A document type declared as an `interface`.** Register type aliases, which is what
  `sanity typegen generate` emits. TypeScript gives an alias an implicit index signature
  and an interface none, and the SDK matches on that signature to tell documents from
  object types. An `interface Book {...}` registered here never matches and resolves to
  `never`; `type Book = {...}` works.
- **Two copies of `@sanity/client`.** The augmentation attaches to whichever copy this
  file resolves, and the SDK reads its own. Run `npm ls @sanity/client` and expect one.

## Handles carry the type context

Inference depends on `documentType` being the literal `'book'` rather than `string`. The
`create*Handle` helpers capture that:

```typescript
import {createDocumentHandle} from '@sanity/sdk'

const bookHandle = createDocumentHandle({
  projectId: 'abc',
  dataset: 'production',
  documentId: '123',
  documentType: 'book',
})
```

A plain object works with `as const`. Prefer the helpers: they are shorter and they fail
earlier when a field is missing.

Handles also carry the dataset, which is how two datasets with a document type of the
same name keep separate shapes.

## Queries

Wrap queries in `defineQuery` from `groq`. It returns the string unchanged; it exists so
the query survives as a literal type that TypeGen can attribute a result to.

```typescript
import {createDatasetHandle} from '@sanity/sdk'
import {useQuery} from '@sanity/sdk-react'
import {defineQuery} from 'groq'

const allBooks = defineQuery('*[_type == "book"]{_id, title}')
const dataset = createDatasetHandle({projectId: 'abc', dataset: 'production'})

function BookList() {
  const {data} = useQuery({...dataset, query: allBooks})
  // data: {_id: string, title: string | null}[]
  return (
    <ul>
      {data.map((book) => (
        <li key={book._id}>{book.title}</li>
      ))}
    </ul>
  )
}
```

A query that is not a literal, built from a plain string or assembled at runtime, is not
looked up. In a new app that yields `never`. In an app carrying a legacy
`sanity.types.ts` it is worse: the legacy lookup matches loosely and returns the union of
every query result registered for that dataset, so you get a type that compiles and is
wrong. Pass an explicit type parameter for these; it is required, not just advisable.

## Projections

Wrap projections in `defineProjection` from `@sanity/sdk`, then pass the result to
`useDocumentProjection`.

```tsx
import {defineProjection} from '@sanity/sdk'
import {useDocumentProjection, type DocumentHandle} from '@sanity/sdk-react'

const authorSummary = defineProjection(`{
  name,
  "awardCount": count(awards)
}`)

function AuthorCard({doc}: {doc: DocumentHandle<'author'>}) {
  const {data} = useDocumentProjection({...doc, projection: authorSummary})
  return <span>{data?.name}</span>
}
```

A projection runs against every document type in the schema, so its result narrows by
document type as well as by dataset. That is why the handle's `documentType` matters here
as much as it does to `useDocument`.

`data` is only inferred for an app set up with the experimental packages, per the table
above. `sanity typegen generate` emits no projection types, so a new app gets `never`
here and should pass an explicit type parameter until the multi-resource command ships.

Projections chosen at runtime are never inferred, because static analysis cannot tell
which one is in play:

```typescript
// Not inferred: the map widens every entry to `string`
const projections: Record<string, string> = {summary: authorSummary, full: authorFull}
const {data} = useDocumentProjection({...doc, projection: projections[selected]})
```

Pass an explicit type parameter for that case.

## List hooks

`useDocuments` and `usePaginatedDocuments` take `documentType` as a string or an array,
and return handles carrying that type. Hooks further down the tree narrow from them.

```tsx
import {createDatasetHandle} from '@sanity/sdk'
import {usePaginatedDocuments} from '@sanity/sdk-react'
import {Suspense} from 'react'

import {DocumentPreview} from './DocumentPreview'

const dataset = createDatasetHandle({projectId: 'abc', dataset: 'test'})

function MixedList() {
  const {data} = usePaginatedDocuments({...dataset, documentType: ['author', 'book']})

  return (
    <ul>
      {data.map((doc) => (
        <Suspense key={doc.documentId} fallback={<li>Loading…</li>}>
          <DocumentPreview doc={doc} />
        </Suspense>
      ))}
    </ul>
  )
}
```

## Typing handles and document data

`DocumentHandle` takes the document type as a parameter, which is useful for props that
must reference one type:

```typescript
import {useDocument, type DocumentHandle} from '@sanity/sdk-react'

function BookComponent({doc}: {doc: DocumentHandle<'book'>}) {
  const {data} = useDocument(doc)
  // data: Book
}
```

For the document data itself, use `ResolveDocument` from `@sanity/sdk`. It takes the
document type and the dataset, in the `projectId.dataset` form:

```typescript
import {type ResolveDocument} from '@sanity/sdk'

type BookData = ResolveDocument<'book', 'abc.production'>

function processBook(book: BookData) {
  console.log(book.title)
}
```

The second parameter is required in practice. Omit it and there is no key to match, so a
literal document type resolves to `never`. Passing the dataset but no document type,
`ResolveDocument<string, 'abc.production'>`, gives you the union of that dataset's
document types; you only get the base document shape when the dataset is unregistered.

## Workflow

**Regenerate after schema and query changes**, once you are on a setup that can.
Generated types are a build artifact, and a schema deployed by someone else changes your
app's types without a commit in your repository, so run generation in CI.

**TypeGen is additive.** Without it, `useQuery` and a literal-`documentType`
`useDocument` both resolve to `never`, because every lookup misses; pass an explicit
generic in that case. An untyped handle still gives `useDocument` the base document
shape. Runtime behavior is identical either way, so it is safe to adopt in an existing
app and safe to leave out.

**JavaScript projects benefit too.** Editors read the generated declarations for
autocompletion even where there is no annotation to check. `defineQuery` and
`defineProjection` are still required, since they are what make a query string
statically findable.
