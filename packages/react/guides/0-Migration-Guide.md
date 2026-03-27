---
title: Migration guide
---

## Migrating to @sanity/sdk-react@3.0.0

### Breaking Changes

#### 1. React 19 required

The minimum peer dependency is now `react` and `react-dom` `^19.2.0`. React 18 and earlier are no longer supported.

```bash
npm install react@latest react-dom@latest
```

#### 2. Named resources replace implicit projectId/dataset config

`<SanityApp>` no longer accepts a `config` array of `{ projectId, dataset }` objects. Instead, declare **named resources** via the `resources` prop:

**Before:**

```tsx
<SanityApp
  config={[
    {projectId: 'abc123', dataset: 'production'},
    {projectId: 'def456', dataset: 'production'},
  ]}
  fallback={<>Loading…</>}
>
  <App />
</SanityApp>
```

**After:**

```tsx
<SanityApp
  resources={{
    'default': {projectId: 'abc123', dataset: 'production'},
    'second-project': {projectId: 'def456', dataset: 'production'},
  }}
  fallback={<>Loading…</>}
>
  <App />
</SanityApp>
```

**Hooks now optionally accept `resourceName` or `resource`**

In v2 of `@sanity/sdk-react`, not passing an explicit `projectId` or `dataset` to a hook meant that it would target the closest nested `<ResourceProvider>`.

Now, in v3 of `@sanity/sdk-react`, not passing an explicit `resource` to a hook means that hook will target the `default` named resource passed to the `<SanityApp>` component.

If you only named one `{ projectId, dataset }` pair in your v2 `<SanityApp>` config, your hooks targeted that pair. By changing your configuration to the `default` named resource per the above example, you will likely have to do very little refactoring.

If your hooks previously relied on `projectId`/`dataset` in the options object, you can now update them to use the supported `resourceName` (to reference a named resource in your `<SanityApp` params) or `resource` (to pass a resource object directly):

```tsx
// Reference a named resource
const {data} = useDocument({
  documentId: '123',
  documentType: 'article',
  resourceName: 'second-project',
})

// Or pass a resource inline
const {data} = useQuery({
  query: '*[_type == "asset"][0...10]',
  resource: {projectId: 'def456', dataset: 'production'},
})
```

The following hooks support `resourceName` / `resource`:

- `useDocument`
- `useDocumentProjection`
- `useDocumentPreview`
- `useQuery`
- `useDocuments`
- `usePaginatedDocuments`
- `usePerspective`
- `useActiveReleases`
- `usePresence` (dataset resources only)

**`ResourceProvider` uses `resource` prop**

`ResourceProvider` no longer accepts `projectId` and `dataset` as direct props. Use the `resource` prop instead:

**Before:**

```tsx
<ResourceProvider projectId="abc123" dataset="production" fallback={<Loading />}>
  <App />
</ResourceProvider>
```

**After:**

```tsx
<ResourceProvider resource={{projectId: 'abc123', dataset: 'production'}} fallback={<Loading />}>
  <App />
</ResourceProvider>
```

#### 3. Removed deprecated APIs

The following APIs were deprecated in v2 and have been removed in v3:

| Removed                                      | Replacement                                                |
| -------------------------------------------- | ---------------------------------------------------------- |
| `getPreviewState` / `GetPreviewStateOptions` | `getProjectionState` with an explicit `projection`         |
| `resolvePreview` / `ResolvePreviewOptions`   | `resolveProjection` with an explicit `projection`          |
| `PreviewStoreState` type                     | Use the return type of `getProjectionState`                |
| `ValidProjection` type                       | Use `string`                                               |
| `ValuePending` type                          | Removed — was only used with the old preview API           |
| `studioMode` config option                   | `studio` config option (or zero-config `SDKStudioContext`) |
| `sanityConfigs` prop on `<SanityApp>`        | `resources` prop                                           |
| `SanityProject` type                         | Import from `@sanity/client`                               |

**`getPreviewState`**

**Before:**

```typescript
const state = getPreviewState(instance, {documentId: '123', documentType: 'product'})
```

**After:**

```typescript
const state = getProjectionState(instance, {
  documentId: '123',
  documentType: 'product',
  projection: '{title, description, "imageUrl": image.asset->url}',
})
```

The old `getPreviewState` returned a fixed set of preview fields. `getProjectionState` replaces it with an explicit GROQ `projection`, giving you full control over which fields are returned.

**`resolvePreview`**

**Before:**

```typescript
const value = await resolvePreview(instance, {documentId: '123', documentType: 'product'})
```

**After:**

```typescript
const value = await resolveProjection(instance, {
  documentId: '123',
  documentType: 'product',
  projection: '{title, description, "imageUrl": image.asset->url}',
})
```

**`studioMode` config**

The recommended replacement is the zero-config `SDKStudioContext` approach. If your SDK component runs inside Sanity Studio, no config is needed at all — `SanityApp` derives everything from the Studio workspace automatically:

```tsx
// Inside Sanity Studio — no config needed:
function MyStudioTool() {
  return (
    <SanityApp fallback={<div>Loading...</div>}>
      <MyComponent />
    </SanityApp>
  )
}
```

If you need programmatic control outside of Studio, replace `studioMode` with `studio`:

**Before:**

```typescript
const config: SanityConfig = {
  projectId: 'abc123',
  dataset: 'production',
  studioMode: {enabled: true},
}
```

**After:**

```typescript
const config: SanityConfig = {
  studio: {},
}
```

#### 4. `@sanity/sdk` agent and comlink utilities moved to sub-entries

If you import directly from `@sanity/sdk` (the core package), agent and comlink utilities are now available only from dedicated sub-entry points:

| Previously in `@sanity/sdk`                                                                             | Now in                |
| ------------------------------------------------------------------------------------------------------- | --------------------- |
| `agentGenerate`, `agentPatch`, `agentPrompt`, `agentTransform`, `agentTranslate` and their option types | `@sanity/sdk/agent`   |
| `getOrCreateController`, `getOrCreateChannel`, `getOrCreateNode`, `getNodeState`, `FrameMessage`, etc.  | `@sanity/sdk/comlink` |

**If you use `@sanity/sdk-react` (recommended), no changes are needed** — it re-exports everything from both sub-entries.

If you import from `@sanity/sdk` directly:

```typescript
// Before
import {agentGenerate, type AgentGenerateOptions} from '@sanity/sdk'
import {type FrameMessage} from '@sanity/sdk'

// After
import {agentGenerate, type AgentGenerateOptions} from '@sanity/sdk/agent'
import {type FrameMessage} from '@sanity/sdk/comlink'
```

#### 5. Explicit `projectId` required for `getDatasetsState` / `useDatasets`

`getDatasetsState` and `useDatasets` now require an explicit `projectId` argument. They no longer infer it from instance config:

**Before:**

```typescript
const datasets = useDatasets()
```

**After:**

```typescript
const datasets = useDatasets({projectId: 'abc123'})
```

#### 6. Experimental typegen and groq dependency removed

The `groq` package is no longer a dependency. `defineQuery` and `defineProjection` are no longer needed or exported. Pass plain strings to `query` and `projection` parameters:

**Before:**

```typescript
import {defineQuery} from 'groq'

const query = defineQuery('*[_type == $type]')
const {data} = useQuery({query, params: {type: 'book'}})
```

**After:**

```typescript
const {data} = useQuery({query: '*[_type == $type]', params: {type: 'book'}})
```

You can safely remove the `groq` package from your dependencies if you were only using it for `defineQuery` / `defineProjection`.

#### 7. Stackable perspectives disallowed

`PerspectiveHandle` no longer accepts array-based (stackable) perspectives. Only single perspectives are allowed:

**Before:**

```typescript
const config: SanityConfig = {
  perspective: ['drafts', 'published'],
}
```

**After:**

```typescript
const config: SanityConfig = {
  perspective: 'drafts',
}
```

Note that the SDK stacks perspectives for you. The SDK automatically fetches all of your content releases, and orders them in the same way the Sanity Studio does: usually by scheduled date, with ASAP releases coming first.

For example, providing a specific perspective that reflects one of your Content Releases, like `{releaseName: 'rvi13yhxK'}` will create a query stack like:

```typescript
;[
  'rvi13yhxK', // your release
  'r0IWxZEkm', // any releases scheduled to come before your release
  'r6IoT17Cj', // an ASAP release
  'drafts',
]
```

This way, previous changes will be incorporated into your selected perspective.

#### 8. Presence refactored to use resources

`usePresence` now accepts `resource` / `resourceName` options. It only supports dataset resources — passing a media library or canvas resource will throw an error:

```typescript
const {locations} = usePresence({resourceName: 'marketing-site'})
```

---

## Migrating to @sanity/sdk-react@2.0.0

### Breaking Changes

1. Changed `status` to `_status` in preview and projection results

The `status` field in preview and projection results has been renamed to `_status` to prevent collisions with user-defined `status` fields and to follow the convention of using underscore prefix for system attributes.

**Before:**

```typescript
const {data} = useDocumentPreview({documentId: '123', documentType: 'product'})
console.log(data?.status?.lastEditedPublishedAt)
```

**After:**

```typescript
const {data} = useDocumentPreview({documentId: '123', documentType: 'product'})
console.log(data?._status?.lastEditedPublishedAt)
```

This change affects:

- `PreviewValue` interface
- Projection results
- Preview results

## Migrating to @sanity/sdk-react@1.0.0

### Breaking Changes

1. `useManageFavorite`, `useNavigateToStudioDocument`, and `useRecordDocumentHistoryEvent` now all suspend.

**Before:**

```typescript
function MyDocumentAction(props: DocumentActionProps) {
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
```

**After:**

```typescript
function FavoriteButton(props: DocumentActionProps) {
  const {documentId, documentType, resourceId} = props
  const {favorite, unfavorite, isFavorited} = useManageFavorite({
    documentId,
    documentType,
    resourceId
  })

  return (
    <Button
      onClick={() => isFavorited ? unfavorite() : favorite()}
      text={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    />
  )
}

// Wrap the component with Suspense since the hook may suspend
function MyDocumentAction(props: DocumentActionProps) {
  return (
    <Suspense fallback={<Button text="Loading..." disabled />}>
      <FavoriteButton {...props} />
    </Suspense>
  )
}
```

---

**The following hooks now also suspend and must be wrapped in `<Suspense>`:**

### `useNavigateToStudioDocument`

**Before:**

```typescript
function NavigateButton({documentHandle}: {documentHandle: DocumentHandle}) {
  const {navigateToStudioDocument, isConnected} = useNavigateToStudioDocument(documentHandle)
  return (
    <Button
      disabled={!isConnected}
      onClick={navigateToStudioDocument}
      text="Navigate to Studio Document"
    />
  )
}
```

**After:**

```typescript
function NavigateButton({documentHandle}: {documentHandle: DocumentHandle}) {
  const {navigateToStudioDocument} = useNavigateToStudioDocument(documentHandle)
  return (
    <Button
      onClick={navigateToStudioDocument}
      text="Navigate to Studio Document"
    />
  )
}

// Wrap the component with Suspense since the hook may suspend
function MyDocumentAction({documentHandle}: {documentHandle: DocumentHandle}) {
  return (
    <Suspense fallback={<Button text="Loading..." disabled />}>
      <NavigateButton documentHandle={documentHandle} />
    </Suspense>
  )
}
```

### `useRecordDocumentHistoryEvent`

**Before:**

```typescript
function RecordEventButton(props: DocumentActionProps) {
  const {documentId, documentType, resourceType, resourceId} = props
  const {recordEvent, isConnected} = useRecordDocumentHistoryEvent({
    documentId,
    documentType,
    resourceType,
    resourceId,
  })
  return (
    <Button
      disabled={!isConnected}
      onClick={() => recordEvent('viewed')}
      text="Viewed"
    />
  )
}
```

**After:**

```typescript
function RecordEventButton(props: DocumentActionProps) {
  const {documentId, documentType, resourceType, resourceId} = props
  const {recordEvent} = useRecordDocumentHistoryEvent({
    documentId,
    documentType,
    resourceType,
    resourceId,
  })
  return (
    <Button
      onClick={() => recordEvent('viewed')}
      text="Viewed"
    />
  )
}

// Wrap the component with Suspense since the hook may suspend
function MyDocumentAction(props: DocumentActionProps) {
  return (
    <Suspense fallback={<Button text="Loading..." disabled />}>
      <RecordEventButton {...props} />
    </Suspense>
  )
}
```

2. Renamed hooks for better clarity and consistency:
   - `usePreview` → `useDocumentPreview`
   - `useProjection` → `useDocumentProjection`

Also renamed associated types to match:

- `UsePreviewOptions` → `useDocumentPreviewOptions`
- `UsePreviewResults` → `useDocumentPreviewResults`
- `UseProjectionOptions` → `useDocumentProjectionOptions`
- `UseProjectionResults` → `useDocumentProjectionResults`

3. Updated `useDocument` return structure

The `useDocument` hook now returns its data under a `data` property for consistency with other hooks in the SDK.

**Before:**

```typescript
// Full document
const product = useDocument({documentId: '123', documentType: 'product'})
console.log(product?.title)

// Path selection
const title = useDocument({
  documentId: '123',
  documentType: 'product',
  path: 'title',
})
console.log(title)
```

**After:**

```typescript
// Full document - now returns {data: T | null}
const {data: product} = useDocument({documentId: '123', documentType: 'product'})
console.log(product?.title) // product is possibly null

// Path selection - now returns {data: T | undefined}
const {data: title} = useDocument({
  documentId: '123',
  documentType: 'product',
  path: 'title',
})
console.log(title) // title is possibly undefined
```

## Migrating to @sanity/sdk-react@0.0.0-rc.7

This version introduces significant improvements for TypeScript users by integrating [Sanity TypeGen](https://www.sanity.io/docs/sanity-typegen). While Typegen is optional, using it unlocks strong type safety for documents, queries, and projections. These changes also refine hook signatures for better consistency, even for JavaScript users.

See the [TypeScript guide](./Typescript.md) for full setup and usage details.

### Key Changes & Requirements

1.  **Consistent Hook Options Pattern:** Most hooks now accept a single options object, often allowing you to spread a `DocumentHandle` or `DatasetHandle`.
2.  **Handle Creation Helpers:** See below for details.

### Handle Creation Helpers

While literal objects still work, using helpers like `createDocumentHandle` (imported from `@sanity/sdk-react`) is recommended, especially with TypeScript, to ensure literal types are captured correctly.

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

Accepts a single options object containing `query`, `params`, and optional `projectId`, `dataset`, etc.

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
const {data} = useQuery({
  query: '*[_type == $type]',
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
