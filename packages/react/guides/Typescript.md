---
title: TypeScript with TypeGen (beta)
---

# Using TypeGen with the Sanity SDK (beta)

[Sanity TypeGen](https://www.sanity.io/docs/sanity-typegen) generates types from your
schemas and GROQ queries. With `typegen.resources`, it writes one types file per dataset
and registers each file's types under that dataset's `projectId.dataset` key. SDK hooks
then infer document, field, query, and projection types from the project and dataset a
handle points at, so you don't pass result types to hooks yourself.

This workflow is in beta. `typegen.resources`, the SDK's type resolvers, and
`defineProjection` with a document type can change in minor releases. Fetching a
dataset's schema from Sanity uses an experimental API.

## Requirements

| Package                               | Version                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| `@sanity/cli`                         | 8.16.0 or later. TypeGen (`@sanity/codegen` 8.2.0) comes with it. |
| `@sanity/sdk-react` and `@sanity/sdk` | 3.9.0 or later                                                    |
| `groq`                                | 6.12.0 or later, if your code imports `defineQuery`               |

Apps created with `npx sanity@latest init --template app-quickstart` do not include
`groq`. Install it before using `defineQuery`:

```bash
pnpm add groq
```

The `sanity` package depends on `@sanity/cli`, but your lockfile can still resolve an
older version. Check which version runs:

```bash
npx sanity --version
```

If it reports a version below 8.16.0, add the CLI as a dev dependency so the `sanity`
command uses the same version:

```bash
pnpm add -D @sanity/cli@^8.16.0
```

## Set up

### 1. Get each dataset's schema

TypeGen needs the schema for every dataset it generates types for. Extract it in the
Studio that defines the schema, and copy the file into your app:

```bash
npx sanity schema extract --path schema.production.json
```

With more than one workspace, add `--workspace <name>`. To make fields with a required
validation rule non-optional in the generated types, add `--enforce-required-fields`.

You can leave out the schema file instead. The CLI then fetches the schema bound to the
dataset, which requires `sanity login` (or `SANITY_AUTH_TOKEN` in CI). Most datasets do
not have a bound schema yet, and generation then stops with "No schema is bound to
dataset". Use an extracted file in that case.

### 2. Declare your datasets once

Put the datasets your app reads in a module that both the app and the CLI config import:

```ts
// src/resources.ts
import type {DocumentResource} from '@sanity/sdk-react'

export const resources = {
  production: {projectId: 'abc123', dataset: 'production'},
  staging: {projectId: 'abc123', dataset: 'staging'},
} as const satisfies Record<string, DocumentResource>
```

`as const` keeps the project ID and dataset as literal types, which inference depends on.
The CLI loads this module in Node, so it must not touch browser globals such as `window`.

### 3. Configure TypeGen

List each dataset under `typegen.resources` in `sanity.cli.ts`:

```ts
// sanity.cli.ts
import {defineCliConfig} from 'sanity/cli'

import {resources} from './src/resources'

export default defineCliConfig({
  app: {organizationId: 'your-org-id', entry: './src/App.tsx'},
  typegen: {
    resources: [
      {
        ...resources.production,
        schema: './schema.production.json',
        generates: './src/sanity.types.production.ts',
      },
      {
        ...resources.staging,
        schema: './schema.staging.json',
        generates: './src/sanity.types.staging.ts',
      },
    ],
  },
})
```

| Field                   | Description                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectId`, `dataset`  | The dataset to generate types for. Each pair can appear once.                                                                                                       |
| `generates`             | The file to write. Each resource needs its own file.                                                                                                                |
| `schema`                | A file from `sanity schema extract`. Leave it out to fetch the schema bound to the dataset.                                                                         |
| `path`                  | Glob pattern, or patterns, for the files to scan for queries and projections. Defaults to `typegen.path`, which defaults to files under `src`, `app`, and `sanity`. |
| `enforceRequiredFields` | For a fetched schema, make fields with a required rule non-optional. Defaults to `false`. A schema file records this when you extract it.                           |

When `resources` is set, the top-level `typegen.schema` and `typegen.generates` are not
used.

### 4. Generate types

```bash
npx sanity typegen generate
```

Run it again after changing a schema, query, or projection. To keep types current, run it
before type checking, for example from your `install` or `typecheck` script. Watch mode
(`--watch`) and generation during `sanity dev` (`typegen.enabled`) do not support
`resources` yet: `--watch` exits with an error, and `sanity dev` skips generation.

### Generated files

Each file exports the dataset's schema types and a result type for each query and
projection TypeGen found. It also registers them under the dataset's key, which is how
hooks find them. Do not edit these files.

- Keep the files inside your TypeScript program. With an `include` of `src`, write them
  under `src`. Hooks cannot see registrations in files outside the program.
- Import a type from the file for the dataset you mean. Two datasets can both export a
  `Book` with different fields:

  ```ts
  import type {Book} from './sanity.types.staging'
  ```

- Commit the generated files, or generate them in CI before type checking. With schema
  files, generation needs no network access or login. Fetching a bound schema in CI needs
  `SANITY_AUTH_TOKEN`.

## Documents and fields

Create handles from your declared datasets. `createDocumentHandle` keeps the project ID
and dataset as literal types:

```tsx
import {createDocumentHandle, useDocument} from '@sanity/sdk-react'

import {resources} from './resources'

export const book = createDocumentHandle({
  ...resources.production,
  documentId: 'book-1',
  documentType: 'book',
})

export function BookTitle() {
  // `Book` from sanity.types.production.ts, or null
  const {data: doc} = useDocument(book)
  // string | undefined
  const {data: title} = useDocument({...book, path: 'title'})
  return <h1>{title ?? doc?._id}</h1>
}
```

## Queries

Define queries with `defineQuery` from `groq`, assigned to a variable. TypeGen generates a
result type for the exact query text, for every dataset whose `path` includes the file:

```tsx
import {useQuery} from '@sanity/sdk-react'
import {defineQuery} from 'groq'

import {resources} from './resources'

export const bookTitlesQuery = defineQuery('*[_type == "book"]{_id, title}')

export function BookTitles() {
  // {_id: string; title: number}[] in staging
  const {data} = useQuery({...resources.staging, query: bookTitlesQuery})
  return (
    <ul>
      {data.map((book) => (
        <li key={book._id}>{book.title}</li>
      ))}
    </ul>
  )
}
```

The same query text resolves to each dataset's own result type. TypeGen can only read
static query text: string literals, and template literals and constants that resolve to
one. Query variable names must be unique across the scanned files.

## Projections

Define projections with `defineProjection` from `@sanity/sdk-react` or `@sanity/sdk`,
assigned to a variable. Pass the document type first, so TypeGen evaluates the projection
for that type:

```tsx
import {defineProjection, useDocumentProjection, type DocumentHandle} from '@sanity/sdk-react'

export const bookCardProjection = defineProjection('book', '{title, "authorName": author->name}')

export function BookCard({doc}: {doc: DocumentHandle<'book', 'production', 'abc123'>}) {
  // {title: string; authorName: string | null}
  const {data} = useDocumentProjection({...doc, projection: bookCardProjection})
  return (
    <span>
      {data.title} by {data.authorName ?? 'Unknown'}
    </span>
  )
}
```

`defineProjection` returns the projection string unchanged. The document type only tells
TypeGen what to generate. Without one, as in `defineProjection('{title}')`, TypeGen
evaluates the projection for every document type in the schema, and a handle whose
document type is only known as `string` gets the union of those results.

## Which dataset's types a hook uses

Hooks look types up by the project ID and dataset as TypeScript sees them on the handle or
options:

| Project ID and dataset in the type                                                                                                                           | Result                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Literal: a handle from `createDocumentHandle` with a declared resource, or a prop typed `DocumentHandle<'book', 'production', 'abc123'>`                     | That dataset's types                                                                                 |
| Unknown: a prop typed `DocumentHandle<'book'>`, a handle without `projectId` and `dataset` that uses the provider's resource, or a dataset chosen at runtime | The union of the matching types from every generated dataset. With one dataset, that dataset's types |
| A dataset with no generated file                                                                                                                             | A generic document with unknown fields                                                               |

`DocumentHandle` takes the document type, then the dataset, then the project ID. A prop
typed with only the document type accepts a handle from either dataset, so its fields
have either dataset's types:

```tsx
import {useDocument, type DocumentHandle} from '@sanity/sdk-react'

export function AnyBookTitle({doc}: {doc: DocumentHandle<'book'>}) {
  // string | number | undefined: the title from either dataset
  const {data: title} = useDocument({...doc, path: 'title'})
  return <h1>{title}</h1>
}
```

A query or projection that TypeGen did not generate for the dataset, such as a query
string built at runtime, resolves to `never`. Pass the result type yourself in that case.
An explicit type parameter always takes precedence:

```tsx
const {data} = useQuery<{count: number}>({...resources.staging, query: 'count(*)'})
```

Media Library and Canvas resources have no generated types. Pass result types for them
explicitly.

## Using TypeGen without `typegen.resources`

TypeGen still supports a single schema with the top-level `typegen.schema` and
`typegen.generates`. Its output does not register types for a dataset, so hooks do not
infer from it. Import the generated types and pass them as type parameters.

Set `overloadClientMethods: false` in `typegen` unless your app depends on
`@sanity/client` directly. Otherwise the generated file augments `@sanity/client`, and
TypeScript reports "Invalid module name in augmentation" when the app cannot resolve it,
as with pnpm.

```tsx
import {useDocument, useQuery, type DocumentHandle} from '@sanity/sdk-react'
import {defineQuery} from 'groq'

import type {AllBooksResult, Book} from './sanity.types'

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

## Migrating from experimental TypeGen

Apps that used the experimental TypeGen fork, with `@sanity/codegen` and `groq` versions
ending in `-typegen-experimental.0`, have a saved `sanity.types.ts` that imports helper
types such as `SchemaOrigin` from `groq`. The SDK supplies compatibility declarations for
those imports, so the saved file keeps working with released `groq` while you migrate.

### Keep the saved file working

1. Keep a copy of your existing `sanity.types.ts`. Stop any install or build script that
   regenerates it with the experimental CLI.
2. Replace your direct experimental `groq` dependency with released `groq`:

   ```bash
   pnpm add groq@^6.12.0
   ```

3. Remove the experimental CLI dependency, including any alias used to install it beside
   the current CLI.
4. Change projection imports. Both SDK packages export the replacement helper:

   ```diff
   - import {defineProjection} from 'groq'
   + import {defineProjection} from '@sanity/sdk-react'
   ```

   `defineQuery` continues to come from `groq`. Keep existing query and projection strings
   unchanged so they match the entries in your saved file.

5. Check your dependency tree and typecheck the app:

   ```bash
   pnpm why groq
   pnpm exec tsc --noEmit
   ```

Your generated file and the SDK must resolve the same released `groq` declarations. If
inference disappears or TypeScript reports missing helper exports, align the app and SDK
versions and update the lockfile. Keeping the experimental fork alongside released `groq`
is unsupported.

The saved file does not update. To change schemas or queries, move to
`typegen.resources`.

### Move to `typegen.resources`

Do this in one change, so old and new registrations do not stay side by side:

1. Install the [required versions](#requirements) and configure each dataset as described
   in [Set up](#set-up).
2. Add the document type to `defineProjection` calls, as in
   `defineProjection('book', '{title}')`. Keep the query and projection text otherwise
   unchanged.
3. Run `npx sanity typegen generate`.
4. Delete the saved `sanity.types.ts`, or remove it from your TypeScript program. While
   both exist, a handle without a literal dataset gets the union of the old and new types.
5. Update imports of generated types to the file for each dataset. A type that the old
   file shared across datasets becomes one export per file.
6. Typecheck, and check the screens that read documents, run queries, and show
   projections.

## Troubleshooting

| Symptom                                                     | Cause and fix                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A hook's result is `never`                                  | TypeGen did not generate that query or projection for the dataset. Check that the call is assigned to a variable, that the file is inside the resource's `path`, that the text is static, and that you ran `sanity typegen generate` after changing it. |
| A hook's result is a generic document                       | The handle's dataset has no generated file, or the generated file is outside your TypeScript program.                                                                                                                                                   |
| A result is a union of two datasets' types                  | The handle's dataset is not a literal type. Type the prop with its dataset and project ID, or create the handle from a declared resource.                                                                                                               |
| "No schema is bound to dataset"                             | The dataset has no bound schema. Extract the schema and set `schema` for that resource.                                                                                                                                                                 |
| "Duplicate query name found"                                | Two scanned files define a query with the same variable name. Rename one.                                                                                                                                                                               |
| "Schema file not found: …/schema.json" with `resources` set | The CLI that runs is older than 8.16.0, so it ignores `resources`. See [Requirements](#requirements).                                                                                                                                                   |
| Typed `client.fetch` results are gone                       | With `resources`, `overloadClientMethods` defaults to `false`. SDK hooks do not use these overloads. With a single resource, set `overloadClientMethods: true` to get them back. With more than one, the generated files would conflict.                |
