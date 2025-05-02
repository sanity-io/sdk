---
title: Migration guide
---

## Migrating to @sanity/sdk-react@0.0.0-rc.7

This version introduces significant improvements for TypeScript users by integrating [Sanity TypeGen](https://www.sanity.io/docs/sanity-typegen). While Typegen is optional, using it unlocks strong type safety for documents, queries, and projections. These changes also refine hook signatures for better consistency, even for JavaScript users.

See the [TypeScript guide](./Typescript.md) for full setup and usage details.

### Key Changes & Requirements

1.  **Typegen Setup (Recommended for TypeScript):** Refer to the [TypeScript guide](./Typescript.md) for detailed setup instructions.
2.  **Consistent Hook Options Pattern:** Most hooks now accept a single options object, often allowing you to spread a `DocumentHandle` or `DatasetHandle`.
3.  **Handle Creation Helpers:** See below for details.

### Handle Creation Helpers

While literal objects still work, using helpers like `createDocumentHandle` (imported from `@sanity/sdk-react`) is recommended, especially with TypeScript, to ensure literal types are captured correctly for Typegen.

**Before:**

```typescript
// === 🛑 BEFORE ===
// Using literal object
const handle = {
  documentId: '123',
  documentType: 'book',
  dataset: 'production',
  projectId: 'abc',
}
```

**After:**

```typescript
// === ✅ AFTER ✨ ===
import {createDocumentHandle} from '@sanity/sdk-react'

// Using helper - recommended
const handle = createDocumentHandle({
  documentId: '123',
  documentType: 'book',
  dataset: 'production',
  projectId: 'abc',
})
```

### Hook Signature Changes

#### `useQuery`

Accepts a single options object containing `query` (defined with `defineQuery`), `params`, and optional `projectId`, `dataset`, etc.

**Before:**

```typescript
// 🛑 BEFORE (does not work)
const {data} = useQuery(
  '*[_type == $type]', // Raw query string
  {type: 'book'}, // Params
  {
    // Options object (separate)
    projectId: 'abc',
    dataset: 'production',
    perspective: 'published',
  },
)
```

**After:**

```typescript
// === ✅ AFTER ✨ ===
import {defineQuery} from 'groq'

const query = defineQuery('*[_type == $type]') // Defined query

const {data} = useQuery({
  // Single options object
  query: query,
  params: {type: 'book'},
  projectId: 'abc', // Optional override
  dataset: 'production', // Optional override
  perspective: 'published',
})
```

#### `useDocument`

Accepts a single options object, spreading the handle and adding `path` if needed.

**Before:**

```typescript
// === 🛑 BEFORE ===
// Fetching the whole document
const document = useDocument(docHandle)

// Fetching a specific path
const name = useDocument(docHandle, 'name')
```

**After:**

```typescript
// === ✅ AFTER ✨ ===
// Fetching the whole document
const document = useDocument(docHandle)
// const document = useDocument({...docHandle}) // Or spread handle

// Fetching a specific path
const name = useDocument({...docHandle, path: 'name'}) // Spread handle and add path
```

#### `useEditDocument`

Accepts a single options object, spreading the handle and adding `path` if needed.

**Before:**

```typescript
// === 🛑 BEFORE ===
// Get setter for the whole document
const setDocument = useEditDocument(docHandle)

// Get setter for a specific path
const setName = useEditDocument(docHandle, 'name')
```

**After:**

```typescript
// === ✅ AFTER ✨ ===
// Get setter for the whole document
const setDocument = useEditDocument(docHandle)
// const setDocument = useEditDocument({...docHandle}) // Or spread handle

// Get setter for a specific path
const setName = useEditDocument({...docHandle, path: 'name'}) // Spread handle and add path
```

#### `useDocuments` / `usePaginatedDocuments`

The `filter` option can still be used for complex GROQ filters. However, for simple filtering by type, the `documentType` option is preferred and aligns better with Typegen scoping.

**Before (Simple type filter):**

```typescript
// === 🛑 BEFORE ===
const {data} = useDocuments({
  filter: '_type == "author"',
  orderings: [{field: 'name', direction: 'asc'}],
})
```

**After (Simple type filter):**

```typescript
// === ✅ AFTER ✨ ===
const {data} = useDocuments({
  documentType: 'author', // Use documentType for simple type filtering
  orderings: [{field: 'name', direction: 'asc'}],
})
```

**Complex Filter (Remains similar):**

**Before:**

```typescript
// === 🛑 BEFORE === (Complex filter)
const {data} = usePaginatedDocuments({
  filter: '_type == "author" && count(favoriteBooks) > 0',
  // ... other options
})
```

**After:**

```typescript
// === ✅ AFTER ✨ === (Complex filter - use filter)
const {data} = usePaginatedDocuments({
  documentType: 'author', // Can still specify type
  filter: 'count(favoriteBooks) > 0', // Add additional filter logic
  // ... other options
})
```

#### `useDocumentEvent`

Accepts a single options object, spreading the handle and adding the `onEvent` callback.

**Before:**

```typescript
// === 🛑 BEFORE ===
useDocumentEvent(onEventCallback, docHandle)
```

**After:**

```typescript
// === ✅ AFTER ✨ ===
useDocumentEvent({...docHandle, onEvent: onEventCallback})
```

### Action Creators & Types

- Action creators (`createDocument`, `editDocument`, `publishDocument`, etc.) and types (`DocumentHandle`, `DatasetHandle`, `DocumentAction`) now use generic type parameters (`<TDocumentType, TDataset, TProjectId>`) for better type safety with Typegen. Usage generally remains the same, but TypeScript users will see improved type checking.
- `applyDocumentActions` similarly uses these generic types and its return type reflects the potentially typed document result (`SanityDocumentResult`).

By adopting these changes, especially `defineQuery` and `defineProjection`, you enable the SDK to leverage Typegen for a much safer and more productive development experience, particularly in TypeScript projects.

### Other Breaking Changes

1. `useManageFavorite` should now have a Suspense boundary.

**Before:**

```typescript
function MyDocumentAction(props: DocumentActionProps) {
  const {documentId, documentType, resourceId} = props
  const {favorite, unfavorite, isFavorited, isConnected} = useManageFavorite({
    _id,
    _type,
    resourceId
  })

  return (
    <Button
      disabled={!isConnected}
      onClick={() => isFavorited ? unfavorite() : favorite()}
      text={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    />
  )
}
```

**After:**

```typescript
 function FavoriteButton(props: DocumentActionProps) {
   const {documentId, documentType, resourceId} = props
   const {favorite, unfavorite, isFavorited, isConnected} = useManageFavorite({
     documentId,
     documentType,
     resourceId
   })

   return (
     <Button
       disabled={!isConnected}
       onClick={() => isFavorited ? unfavorite() : favorite()}
       text={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
     />
   )
 }

 // Wrap the component with Suspense since the hook may suspend
 function MyDocumentAction(props: DocumentActionProps) {
   return (
     <Suspense
       fallback={
         <Button
           text="Loading..."
           disabled
         />
       }
     >
       <FavoriteButton {...props} />
     </Suspense>
   )
 }
```

## Migrating to @sanity/sdk-react@0.0.0-rc.4

### Breaking Changes

1. Removed Authentication Components and Hooks:

   - Removed `<Login />` component - authentication now redirects to sanity.io/login
   - Removed `<LoginLayout />` component and its related props
   - Removed `useLoginUrls` hook - replaced with `useLoginUrl` hook that returns a single login URL
   - `<AuthBoundary />` now automatically redirects to sanity.io/login when logged out
   - `<LoginCallback />` now renders null during the callback process

2. Authentication Flow Changes:

   - Authentication now uses a centralized login page at sanity.io/login
   - Token refresh interval is now consistently set to 12 hours for all environments

3. Renamed hooks:

   - `useInfiniteList` is now `useDocuments`
   - `usePaginatedList` is now `usePaginatedDocuments`
   - `usePermissions` is now `useDocumentPermissions`
   - `useApplyActions` is now `useApplyDocumentActions` (and the `applyActions` function is now `applyDocumentActions`)
   - related types have been renamed; this is documented in full below

4. Re-exported core SDK: The `@sanity/sdk` package is now fully re-exported from `@sanity/sdk-react`. This means you only need to install and import from `@sanity/sdk-react` to access both React-specific hooks/components and core SDK functions/types. You should update your imports accordingly and remove `@sanity/sdk` as a direct dependency if it's no longer needed.

5. Improved component hierarchy with `<SanityApp />`, `<SDKProvider />`, and `<ResourceProvider />`
6. Simplified document references with explicit `projectId` + `dataset` fields
7. Standardized property names across the SDK
8. Unified hook interfaces with the handle pattern

### Provider Components

We've updated our component hierarchy to provide better flexibility and control over resource management:

- `<SanityApp />`: The recommended top-level component for most applications
- `<SDKProvider />`: An intermediate component with authentication boundaries (for advanced use cases)
- `<ResourceProvider />`: The foundational component for individual resource configurations

#### Using `<SanityApp />`

For most applications, particularly dashboard applications, we recommend using the `<SanityApp />` component:

```tsx
// Single project configuration
<SanityApp
  config={{projectId: 'abc1235', dataset: 'production'}}
  fallback={<>Loading…</>}
>
  <App />
</SanityApp>

// Multiple project configuration
<SanityApp
  config={[
    {projectId: 'abc1235', dataset: 'production'},
    {projectId: 'xyz1235', dataset: 'production'},
  ]}
  fallback={<>Loading…</>}
>
  <App />
</SanityApp>
```

The `config` prop replaces the previous `sanityConfigs` prop and supports both single and multiple configurations. When providing multiple configurations, the first one in the array will be the default instance.

### Document Handle Pattern

We've introduced a consistent "handle" pattern across the SDK for working with documents and configuration. This replaces the previous `resourceId` concept with more explicit fields.

#### Document References

**Before:**

```ts
const doc: DocumentHandle<Author> = {
  _type: 'author',
  _id: 'db06bc9e-4608-465a-9551-a10cef478037',
  resourceId: 'document:ppsg7ml5.test:db06bc9e-4608-465a-9551-a10cef478037',
}
```

**After:**

```ts
const doc: DocumentHandle<Author> = {
  documentType: 'author', // Previously _type
  documentId: 'db06bc9e-4608-465a-9551-a10cef478037', // Previously _id
  projectId: 'ppsg7ml5', // From resourceId
  dataset: 'test', // From resourceId
}
```

#### Handle Interfaces

The SDK now uses three main handle types:

```ts
// For project-level operations
interface ProjectHandle {
  projectId?: string
}

// For dataset-level operations
interface DatasetHandle extends ProjectHandle {
  dataset?: string
}

// For document operations
interface DocumentHandle extends DatasetHandle {
  documentId: string
  documentType: string
}
```

### Hook Updates: Renaming

Various hooks and associated types have been renamed for clarity. Their signatures remain the same, aside from the use of document handles, which is covered in the next section.

- `useInfiniteList` is now `useDocuments`
- type `InfiniteListOptions` is now `DocumentsOptions`
- type `InfiniteList` is now `DocumentsResponse`
- `usePaginatedList` is now `usePaginatedDocuments`
- type `PaginatedListOptions` is now `PaginatedDocumentsOptions`
- type `PaginatedList` is now `PaginatedDocumentsResponse`
- `useApplyActions` is now `useApplyDocumentActions`
- function `applyActions` is now `applyDocumentActions`
- type `ApplyActionsOptions` is now `ApplyDocumentActionsOptions`
- `usePermissions` is now `useDocumentPermissions`
- type `PermissionsResult` is now `DocumentPermissionsResult`

### Hook Updates: Document Handles

Many hooks have been updated to use the handle pattern consistently.

#### Document Hooks

**Before:**

```ts
function Preview({document}: {document: DocumentHandle}) {
  const {data} = useProjection({document, projection: '{title}'})
  const {data: preview} = usePreview({document, ref: someRef})
  return // ...
}
```

**After:**

```ts
interface PreviewProps extends DocumentHandle {
  showExtra?: boolean
}

function Preview({showExtra, ...docHandle}: PreviewProps) {
  const ref = useRef<HTMLElement>(null)
  const {data} = useProjection({...docHandle, ref, projection: '{title}'})
  const {data: preview} = usePreview({...docHandle, ref})
  return // ...
}
```

#### Query and List Hooks

All query-based hooks now accept `DatasetHandle` for configuration:

```tsx
// useQuery with optional project/dataset override
const {data} = useQuery('*[_type == $type][0...10]', {
  params: {type: 'author'},
  projectId: 'abc12345', // Optional - inherits from ResourceProvider
  dataset: 'production', // Optional - inherits from ResourceProvider
})

// List hooks with configuration
const {data: documents} = useDocuments({
  filter: '_type == "product"',
  projectId: 'xyz12345', // Optional
  dataset: 'staging', // Optional
  batchSize: 20,
})

// Returned documents include full context
documents.map((docHandle) => (
  <DocumentPreview
    key={docHandle.documentId}
    {...docHandle} // Includes projectId, dataset, etc.
  />
))
```

#### Project and Dataset Hooks

Project and dataset hooks now use the handle pattern:

```ts
// Before
const project = useProject('abc12345')

// After
const project = useProject({projectId: 'abc12345'})
const datasets = useDatasets({projectId: 'abc12345'})
```

> 🔄 **Coming Soon**: We're continuing to refine our APIs. Future releases will include:
>
> - Further unification of hook signatures
> - More consistent parameter naming
> - Additional handle pattern improvements
> - Enhanced TypeScript types and validations

### Breaking Changes Summary

1. Authentication Changes:

   - Removed `<Login />`, `<LoginLayout />`, and `useLoginUrls`
   - `<AuthBoundary />` and `<LoginCallback />` behavior changes
   - Centralized login at sanity.io/login
   - 12-hour token refresh interval

2. Component Changes:

   - `<SanityApp />` now uses `config` instead of `sanityConfigs`
   - `<SDKProvider />` now uses `config` prop for multiple configurations
   - `<ResourceProvider />` provides granular control for single configuration
   - `<SanityProvider />` removed

3. Hook Renames:

   - `useInfiniteList` is now `useDocuments`
   - `usePaginatedList` is now `usePaginatedDocuments`
   - `usePermissions` is now `useDocumentPermissions`
   - `useApplyActions` is now `useApplyDocumentActions` (and the `applyActions` function is now `applyDocumentActions`)
   - related types have been renamed (see related section above)

4. `@sanity/sdk` Re-exported: All exports from `@sanity/sdk` are now available directly from `@sanity/sdk-react`.

5. Property Renames:

   - `_type` → `documentType`
   - `_id` → `documentId`
   - `results` → `data` (in hook returns)
   - Removed `resourceId` concept

6. Interface Updates:
   - All document hooks use `DocumentHandle`
