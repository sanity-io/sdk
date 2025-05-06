---
title: Typescript with TypeGen (experimental)
---

# Using Typegen with the Sanity SDK

[Sanity TypeGen](https://www.sanity.io/docs/sanity-typegen) is a tool that generates TypeScript types directly from your Sanity schemas and GROQ queries. When used with the Sanity SDK, it provides strong type safety and autocompletion for your documents, query results, and projections, significantly improving the development experience.

This guide explains how to set up and use Typegen within your SDK project.

## Benefits

- **Type Safety:** Catch errors at build time instead of runtime.
- **Autocompletion:** Get intelligent suggestions for document fields and query results in your editor.
- **Improved Maintainability:** Types make code easier to understand and refactor.
- **Dataset & Document Scoping:** Generate types that correctly narrow based on the specific dataset or document type context.

## Setup

Using Typegen involves two main steps: extracting your schema(s) and then generating the types. Both commands are available via the CLI.

### 1. Extracting Schemas

First, you need to extract your Sanity schema(s) into a JSON format that Typegen can understand. **Currently, this step relies on the full `sanity` package**, typically used within your Sanity Studio project, as Typegen needs access to the complete schema definition to generate accurate types.

Schema extraction is performed within your Studio setup to generate the `schema.json` file. Once created, this file can be used independently by other tools or parts of your workflow.

**Note:** We recognize that requiring the Studio environment solely for this generation step isn't ideal, and we're actively working on improving this workflow in future SDK updates to make the process more self-contained.

Use the `sanity schema extract` command within your Studio project or a project that has the `sanity` package installed:

```bash
# Run this in your Sanity Studio project directory
npx sanity schema extract --workspace <workspace-name> --output-path <path/to/schema.json>
```

This `schema.json` file can be copied to (or the `--output-path` can be set directly to) your Sanity app's repository. Your application itself does _not_ need the full `sanity` package as a dependency to use the generated types; it only needs the `schema.json` file for the `typegen generate` step.

- **Multiple Schemas/Workspaces:** If your Studio project defines multiple workspaces or you need types for different schemas (e.g., for different datasets), run the `extract` command for each one, outputting to separate JSON files.

Example `package.json` script within a Studio project for extracting two schemas:

```json
{
  "scripts": {
    "schema:extract:test": "sanity schema extract --workspace test --output-path ../my-frontend-app/schema-test.json",
    "schema:extract:prod": "sanity schema extract --workspace production --output-path ../my-frontend-app/schema-prod.json",
    "schema:extract": "npm run schema:extract:test && npm run schema:extract:prod"
  }
}
```

**Note:** We plan to improve this schema extraction process as the SDK matures to potentially reduce the dependencies and improve overall developer experience.

### 2. Installing Experimental Packages

To use the Typegen features described in this guide, your Sanity app needs specific experimental versions of `@sanity/cli` and `groq` installed:

```bash
# Using npm
npm install groq@typegen-experimental-2025-04-23
npm install @sanity/cli@typegen-experimental-2025-04-23 --save-dev

# Or using pnpm
pnpm add groq@typegen-experimental-2025-04-23
pnpm add @sanity/cli@typegen-experimental-2025-04-23 --save-dev
```

**Note:** These are experimental pre-release versions. The package names and installation process may change as these features stabilize.

### 3. Configuring Typegen (Optional)

For the most common use case – a single Sanity schema for your project – **no configuration file is needed**.
However, you’ll need to create a Typegen configuration file for more complex use cases, such as:

- Using multiple schemas (e.g., from different workspaces or for different datasets).
- Needing to explicitly map a single schema to a specific `projectId` and `dataset` for accurate type scoping (instead of using `'default'`).
- Using a different name or location for your schema file(s).
- Specifying a custom output path for the generated types file.

If you need this level of configuration, create a Typegen configuration file (`sanity-typegen.json` ) and use the `schemas` array:

```json
// sanity-typegen.json
{
  "schemas": [
    {
      "projectId": "your-project-id", // Explicit project ID
      "dataset": "test", // Explicit dataset name
      "schemaPath": "./schemas/test-schema.json" // Path to this schema
    },
    {
      "projectId": "your-project-id",
      "dataset": "production",
      "schemaPath": "./schemas/prod-schema.json"
    }
    // Add more schema objects if needed
  ]
  // Optional: Specify output path for generated types
  // "outputPath": "./src/generated/sanity-types.ts"
}
```

Objects in the `schemas` array each consist of the following properties:

- **`projectId`:** Required to map the schema to the correct project for type generation. The extracted `schema.json` doesn't contain this info itself.
- **`dataset`:** Required to map the schema to the correct dataset for type generation. The extracted `schema.json` doesn't contain this info itself.
- **`schemaPath`:** The path (relative to the project root) to the corresponding extracted schema JSON file.

By default, Typegen works seamlessly for the common single-schema setup without extra configuration. Use `sanity-typegen.json` only when your needs require more explicit control. The optional **`outputPath`** property specifies where to write the generated `sanity.types.ts` file. It defaults to the project root.

### 4. Generating Types

Now, with the necessary packages installed and your schema(s) extracted (and optionally configured in `sanity-typegen.json`), you can run the `sanity typegen generate` command:

```bash
# use `@sanity/cli` package directly for now
./node_modules/@sanity/cli/bin/sanity typegen generate
```

This command reads your configuration (either `sanity-typegen.json` or the default `schema.json`), processes the specified schemas, and generates `sanity.types.ts` containing your types. It's recommended to add this command to your `package.json` scripts.

```json
{
  "scripts": {
    "typegen": "./node_modules/@sanity/cli/bin/sanity typegen generate"
  }
}
```

## Using Generated Types

The generated file contains types for your schema documents, projections, and query results. The SDK hooks will automatically pick up these types if the Typegen file exists in your project.

### Document Types & Dataset Scoping

Typegen generates interfaces for each document type defined in your schemas. For projects using multiple schemas/datasets defined in `sanity-typegen.json`, it utilizes a helper type `DatasetScoped` (imported from `groq`) to brand the types. This allows TypeScript to narrow down the possible document types based on the dataset context provided via a `DocumentHandle`.

```typescript
import {useDocument, createDatasetHandle} from '@sanity/sdk-react'

// Assuming 'book' is only in 'test' dataset, 'dog' only in 'production'
const testHandle = createDatasetHandle({
  projectId: 'your-project-id',
  dataset: 'test',
  documentId: 'some-id',
  documentType: 'book', // Type narrowed to 'book'
})

const prodHandle = createDatasetHandle({
  projectId: 'your-project-id',
  dataset: 'production',
  documentId: 'another-id',
  documentType: 'dog', // Type narrowed to 'dog'
})

function MyComponent() {
  const {data: bookData} = useDocument(testHandle)
  // bookData is correctly typed as Book

  const {data: dogData} = useDocument(prodHandle)
  // dogData is correctly typed as Dog

  // ...
}
```

### Handles and Literal Types: `createDocumentHandle` vs `as const`

For Typegen to correctly infer types in hooks like `useDocument`, it needs to know the _specific_ literal type of the `documentType` (e.g., `'book'` instead of just `string`).

The SDK provides helper functions (like `createDocumentHandle`, `createDatasetHandle` located in `@sanity/sdk` or `@sanity/core`) that help capture these literal types:

```typescript
import {createDocumentHandle} from '@sanity/sdk'

// Using the helper ensures handle.documentType is typed as 'book'
const handle = createDocumentHandle({
  documentId: '123',
  documentType: 'book',
  dataset: 'production',
  projectId: 'abc',
})
```

Alternatively, if you prefer defining handles as plain objects, use `as const`:

```typescript
const handle = {
  documentId: '123',
  documentType: 'book',
  dataset: 'production',
  projectId: 'abc',
} as const // 'as const' ensures documentType is 'book', not string

// Now handle.documentType has the literal type 'book'
```

**Recommendation:** Use `createDocumentHandle` (or other `create*Handle` helpers) when using Typegen for cleaner code.

### Projections: `defineProjection`

To get types for GROQ projections used with `useDocumentProjection`, you **must** define them using the `defineProjection` helper from `groq`. Typegen scans your code for these definitions.

```typescript
import {defineProjection} from 'groq'
import {useDocumentProjection, type DocumentHandle} from '@sanity/sdk-react'

// Typegen derives the type name (AuthorSummaryProjectionResult) from the variable name
export const authorSummary = defineProjection({
  name: 'name',
  favoriteBookTitles: 'favoriteBooks[]->title',
})

function AuthorDetails({doc}: {doc: DocumentHandle<'author'>}) {
  // The type of `data` is inferred from `authorProjection`
  const {data} = useDocumentProjection({
    ...doc, // Spread the handle containing documentId, type, etc.
    projection: authorProjection,
  })

  // data is typed as AuthorSummaryProjectionResult
  // Autocompletion works for data.name and data.favoriteBookTitles
  return <div>{data?.name}</div>
}
```

- The generated type (e.g., `AuthorSummaryProjectionResult`) includes a `DocumentTypeScoped` brand, allowing unions of projection results if a projection applies to multiple document types.
- Typegen intelligently removes types from the projection result if all fields in the projection evaluate to `null` for a given document type.
- When using Typegen, you **cannot** pass raw projection strings to `useDocumentProjection` and get type inference; you must use `defineProjection`.

### Queries: `defineQuery`

Similarly, for `useQuery`, you **must** define your GROQ queries using `defineQuery` from `@sanity/groq-sdk` to get type inference.

```typescript
import {defineQuery} from '@sanity/groq-sdk'
import {useQuery} from '@sanity/sdk-react'

// Typegen derives the type name (AllBooksQuery) from the variable name
export const allBooksQuery = defineQuery('*[_type == "book"]{ _id, title }')

function BookList() {
  // Type of `data` is inferred from `allBooksQuery`
  const {data} = useQuery({query: allBooksQuery})

  // data is typed as Array<{_id: string, title: string}> (or similar)
  return (
    <ul>
      {data?.map((book) => (
        <li key={book._id}>{book.title}</li>
      ))}
    </ul>
  )
}
```

- `useQuery` accepts options as a single object, allowing you to spread handles easily:
  ```typescript
  const handle = createDatasetHandle({dataset: 'test', projectId: 'abc'})
  const {data} = useQuery({...handle, query: allBooksQuery})
  ```

### List Hooks: `useDocuments` & `usePaginatedDocuments`

These hooks benefit from Typegen through dataset scoping (as shown earlier). Use the `documentType` option to specify the document type(s) you are querying:

```tsx
import {usePaginatedDocuments} from '@sanity/sdk-react'
import {createDatasetHandle} from '@sanity/sdk'
import {DocumentPreview} from './your-document-preview'

const testDataset = createDatasetHandle({dataset: 'test', projectId: 'abc'})

function MixedList() {
  // Specify the types being queried
  const {data} = usePaginatedDocuments({
    ...testDataset,
    documentType: ['author', 'book'], // Pass string or array of strings
  })

  // `data` is an array of DocumentHandles, correctly scoped.
  // If used with `useDocument` (and other hooks) later, types will be scoped
  // appropriately (e.g. Author | Book).
  return (
    <ul>
      {docHandles.map((doc) => (
        // Use Suspense for each item in case projection is slow
        <Suspense key={doc.documentId} fallback={<li>Loading...</li>}>
          <DocumentPreview doc={doc} />
        </Suspense>
      ))}
    </ul>
  )
}
```

### Working with Specific Document Types

When you know the specific document type you're dealing with, you can make your TypeScript code even more precise.

#### Parameterizing `DocumentHandle`

`DocumentHandle` is a generic type that accept type parameters. You can provide a specific document type literal (like `'book'`) as a type argument. This is useful for typing props or variables that should only reference a handle for a specific document type:

```typescript
import {type DocumentHandle} from '@sanity/sdk-react'

// This function expects a handle that *must* reference a 'book' document
function BookComponent({doc}: {doc: DocumentHandle<'book'>}) {
  // Thanks to DocumentHandle<'book'>, TypeScript knows the context
  const {data} = useDocument(doc)
  // `data` will be typed as the generated `Book` interface
  // ...
}
```

This works because the full definition of `DocumentHandle` includes generic type parameters (`TDocumentType`, `TDataset`, `TProjectId`) that default to `string` but can be made more specific.

#### Using `SanityDocumentResult` for Document Data

If you need the type for the actual document _data_ itself (not just the handle), the `groq` package exports the `SanityDocumentResult<TDocumentType>` helper type. Pass the document type literal to get the corresponding generated interface for the document content:

```typescript
import {type SanityDocumentResult} from 'groq'

type BookData = SanityDocumentResult<'book'>
// BookData is now equivalent to the generated Book interface (e.g., { _id: string; title: string; ... })

// This function expects the fully typed book data
function processBook(book: BookData) {
  console.log(book.title) // Autocomplete works!
}
```

In summary:

- Use `DocumentHandle<'yourType'>` to constrain a document handle to documents of a specific type.
- Use `SanityDocumentResult<'yourType'>` to type the actual data structure of a document of a specific type.

## Workflow Considerations

By integrating Sanity TypeGen into your workflow, you can leverage the full power of TypeScript with the Sanity SDK, leading to more robust, maintainable, and developer-friendly applications.

### Regeneration

You’ll need to re-run `npx sanity typegen generate` whenever you:

- Change your Sanity schemas.
- Add or modify queries/projections defined with `defineQuery` or `defineProjection`.
- Consider integrating this into your `dev` script or a file watcher.

### Typegen is additive

Typegen is designed to enhance the SDK experience. If you don't use it, the SDK hooks will still work, but data types will often default to `any` or `unknown`, losing the benefits of TypeScript. Adopting Typegen later should be a non-breaking change that simply adds type safety.

### JavaScript Projects

Even if your project doesn't use TypeScript, you can still leverage Typegen to enhance your JavaScript development experience.

By following the steps in this guide – extracting your schema, installing the necessary packages, using helpers like `createDocumentHandle`, `defineProjection`, and `defineQuery`, and running `npx sanity typegen generate` – you create a `sanity.types.ts` file.

While your JavaScript code won't undergo compile-time type checking, modern code editors (like VS Code) that use the TypeScript language service can read this generated file.

This often results in significantly better autocompletion and Intellisense within your JavaScript files when interacting with SDK hooks and data, compared to working without Typegen. Remember, using `defineProjection` and `defineQuery` is still required for Typegen to generate types for those specific artifacts.
