---
title: Migration guide
---

## Migrating to @sanity/sdk-react@3.0.0

### Breaking Changes

1. `useProject`, `useProjects`, `useOrganization`, `useOrganizations`, and `useDatasets` return a result object

These five hooks are now backed by a live re-fetching utility. Instead of returning the fetched value directly, they return a `FetcherHookResult`: `{data, isFetching, error, refetch}`. The hook still suspends until the first fetch succeeds, so `data` is always present once your component renders.

**Before:**

```typescript
const project = useProject({projectId})
const projects = useProjects()
const organization = useOrganization({organizationId})
const organizations = useOrganizations()
const datasets = useDatasets()
```

**After:**

```typescript
const {data: project} = useProject({projectId})
const {data: projects} = useProjects()
const {data: organization} = useOrganization({organizationId})
const {data: organizations} = useOrganizations()
const {data: datasets} = useDatasets()
```

Destructuring in place works the same way:

**Before:**

```typescript
const {organizationId, id} = useProject()
```

**After:**

```typescript
const {
  data: {organizationId, id},
} = useProject()
```

No other hooks changed shape.

2. These hooks now revalidate in the background

Fetched data is considered fresh for 30 seconds. After that, the hook serves the cached value immediately and refetches in the background, so a mounted component can receive new data without remounting. In v2 each entry was fetched once and cached for the lifetime of the instance.

If you relied on the value being stable for as long as the component was mounted, read `isFetching` to tell a background refresh apart from settled data, and use `refetch` to force a fresh read:

```typescript
const {data: project, isFetching, refetch} = useProject({projectId})
```

`refetch` bypasses the freshness window and resolves with the refreshed data.

3. Background fetch errors no longer reach your error boundary

Only the initial fetch throws. Once data has rendered, a failed background revalidation is reported through `error` while the last successful value keeps rendering; the next success clears it. An error boundary alone will no longer surface these failures.

```typescript
const {data: projects, error} = useProjects()

if (error) {
  // stale data is still rendering — surface a refresh warning if you need one
}
```

4. Datasets and favorites in `@sanity/sdk` changed public interfaces

The datasets and favorites stores moved onto the same fetching paradigm that backs the hooks in 1. This means their store-specific functions and the legacy fetcher-store types (`getDatasetsState`, `resolveDatasets`, `getFavoritesState`, `resolveFavoritesState`, `FetcherStore`, and `FetcherStoreState`) have been removed. Most users were likely using the `@sanity/sdk-react` hooks and are likely not affected (except for the changed return signature of `useDatasets` mentioned in the first item).

5. Removed the preliminary intent hooks

The `useDispatchIntent` hook and the `defineIntent` function have been removed, along with the `Intent` and `IntentFilter` types.

The other half of this system was never built: defined intents were never registered anywhere, and a dispatched intent had no handler to resolve to. `dispatchIntent()` sent a window message that nothing listened for, so removing these APIs does not change how your app behaves at runtime.

6. `@sanity/sdk` agent and comlink utilities moved to sub-entries

Agent and comlink utilities are now available only from dedicated sub-entry points:

| Previously in `@sanity/sdk`                                                                             | Now in                |
| ------------------------------------------------------------------------------------------------------- | --------------------- |
| `agentGenerate`, `agentPatch`, `agentPrompt`, `agentTransform`, `agentTranslate` and their option types | `@sanity/sdk/agent`   |
| `getOrCreateController`, `getOrCreateChannel`, `getOrCreateNode`, `getNodeState`, `FrameMessage`, etc.  | `@sanity/sdk/comlink` |

**Before:**

```typescript
import {agentGenerate, type AgentGenerateOptions, type FrameMessage} from '@sanity/sdk'
```

**After:**

```typescript
import {agentGenerate, type AgentGenerateOptions} from '@sanity/sdk/agent'
import {type FrameMessage} from '@sanity/sdk/comlink'
```

`@sanity/sdk-react` re-exports the main `@sanity/sdk` entry point, but not these two sub-entries. Make the above code changes to get access to these.

7. Internal utilities removed from the public API

A handful of helpers that only existed to support the React layer are no longer part of the public API: `isStudioConfig`, `getClientErrorApiBody`, `getClientErrorApiDescription`, `getClientErrorApiType`, `isProjectUserNotFoundClientError`, `ApiErrorBody`, `PREVIEW_PROJECTION`, `transformProjectionToPreview`, `getQueryKey`, `parseQueryKey`, `getUsersKey`, `parseUsersKey`, and `createGroqSearchFilter`.

These were never intended as app-facing APIs and have no stability guarantee. If you depend on one, open an issue describing your use case so we can consider a supported replacement.

8. Deprecated `source` APIs removed in favour of `resource`

v2 introduced `source` and then the `resource` parameter to allow for easier usage of different datasets and also Media Library and Canvas stores. The `source` alias has been removed:

| Removed                                                                 | Use instead                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `source` option on handles                                              | `resource`                                                                      |
| `sourceName` option on hooks                                            | `resourceName`                                                                  |
| `sources` config option                                                 | `resources` prop on `<SanityApp>` (see 12)                                      |
| `DocumentSource`, `DatasetSource`, `MediaLibrarySource`, `CanvasSource` | `DocumentResource`, `DatasetResource`, `MediaLibraryResource`, `CanvasResource` |
| `isDatasetSource`, `isMediaLibrarySource`, `isCanvasSource`             | `isDatasetResource`, `isMediaLibraryResource`, `isCanvasResource`               |

**Before:**

```typescript
const {data} = useDocuments({sourceName: 'media-library'})
```

**After:**

```typescript
const {data} = useDocuments({resourceName: 'media-library'})
```

9. Deprecated preview APIs removed

The preview store was superseded by the projection store in v2 for the `core` package (`useDocumentPreview` still exists). The deprecated wrappers have been removed:

| Removed                                      | Use instead                                        |
| -------------------------------------------- | -------------------------------------------------- |
| `getPreviewState` / `GetPreviewStateOptions` | `getProjectionState` with an explicit `projection` |
| `resolvePreview` / `ResolvePreviewOptions`   | `resolveProjection` with an explicit `projection`  |
| `PreviewStoreState`                          | Use the return type of `getProjectionState`        |
| `ValuePending`                               | Removed — was only used by the old preview API     |

The `useDocumentPreview` hook is unaffected; it has been backed by the projection store since v2.

10. Other deprecated options and types removed

| Removed                               | Use instead                                                |
| ------------------------------------- | ---------------------------------------------------------- |
| `studioMode` config option            | `studio` config option (or zero-config `SDKStudioContext`) |
| `ValidProjection` type                | `string` — projection strings are validated at runtime     |
| `sanityConfigs` prop on `<SanityApp>` | `config` prop                                              |
| `ProjectWithoutMembers` type          | `Project`                                                  |

11. `useSanityInstance` no longer accepts a config argument

Passing a config to match against the instance hierarchy was deprecated in v2 and already had no effect — it logged a warning and returned the context instance regardless. The parameter is now removed.

**Before:**

```typescript
const instance = useSanityInstance(myConfig)
```

**After:**

```typescript
const instance = useSanityInstance()
```

11. The parent/child `SanityInstance` hierarchy is removed

`SanityInstance.getParent()`, `SanityInstance.createChild()`, and `SanityInstance.match()` have been removed. SDK apps use a single instance for all resources, so the hierarchy had no remaining purpose.

If you used `createChild` to scope work to a different project or dataset, pass an explicit `resource` to the operation instead:

**Before:**

```typescript
const child = instance.createChild({projectId: 'other', dataset: 'production'})
applyDocumentActions(child, {actions})
```

**After:**

```typescript
applyDocumentActions(instance, {actions, resource: {projectId: 'other', dataset: 'production'}})
```

**The instance config still acts as the default resource in core.** This is unchanged; neither of the two removals above affects it. If you configure a project and dataset when you create the instance, you can keep calling resource-scoped APIs without passing a `resource`:

```typescript
const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

// still resolves to {projectId: 'p', dataset: 'd'}
getDocumentState(instance, {documentId: 'doc1', documentType: 'author'})
```

The same applies to `perspective`: set it once on the instance and it is used by any call that does not pass its own. An explicit `resource` or `perspective` on an individual call always wins over the instance config. This remains the recommended way to use the core SDK directly, without the React layer.

12. `SanityConfig.resources` removed; `resource` is now an effective default

`resources` (plural) was a map of named resources on the instance config, but the core SDK package never read it; named-resource lookup is a React-layer feature driven by the `resources` prop on `<SanityApp>` / `<SDKProvider>`, which is unchanged. The config field has been removed.

```typescript
// Before — had no effect in core
const instance = createSanityInstance({
  projectId: 'p',
  dataset: 'd',
  resources: {'media-library': {mediaLibraryId: 'ml-123'}},
})

// After — named resources stay a React concern
<SanityApp config={{projectId: 'p', dataset: 'd'}} resources={{'media-library': {mediaLibraryId: 'ml-123'}}} />
```

In its place, `resource` (singular) on `SanityConfig` now works as the instance's default resource. Previously it type-checked but was ignored; calls fell back to `projectId`/`dataset` regardless. Any call that does not pass its own `resource` now operates against it:

```typescript
const instance = createSanityInstance({resource: {mediaLibraryId: 'ml-123'}})

// resolves against the media library — no per-call resource needed
getDocumentState(instance, {documentId, documentType})
```

Unlike `projectId`/`dataset`, this can be a media library or canvas resource, so the whole surface is usable against those without threading a `resource` through every call. `projectId`/`dataset` remain to try to maintain some compatibility with v2, but may be removed in a future version.

```typescript
const instance = createSanityInstance({
  projectId: 'p',
  resource: {mediaLibraryId: 'ml-123'},
})
```

Relatedly, `useActiveReleases` and `useAllReleases` now take a `DatasetHandle` rather than a `SanityConfig`. Both already ignored the config-only fields, and this keeps them accepting an explicit `resource`.

13. Dashboard hooks moved to a sub-entry

Dashboard hooks have moved to the dedicated `@sanity/sdk-react/dashboard` entry point:

| Previously in `@sanity/sdk-react` | Now in `@sanity/sdk-react/dashboard` |
| --------------------------------- | ------------------------------------ |
| `useDashboardOrganizationId`      | `useOrganizationId`                  |
| `useDashboardNavigate`            | `useNavigate`                        |
| `useNavigateToStudioDocument`     | `useNavigateToStudioDocument`        |
| `useWindowTitle`                  | `useWindowTitle`                     |
| `useAgentResourceContext`         | `useAgentResourceContext`            |

The related types have moved to the same entry point:

| Previously in `@sanity/sdk-react` | Now in `@sanity/sdk-react/dashboard` |
| --------------------------------- | ------------------------------------ |
| `AgentResourceContextOptions`     | `AgentResourceContextOptions`        |
| `NavigateToStudioResult`          | `NavigateToStudioResult`             |

14. `useManageFavorite` split into `useFavorite` and `useUpdateFavorite`

`useManageFavorite` both read and wrote favorite status. It is replaced by a read hook and a write hook, matching the CRUD naming used by the rest of the SDK. `useFavorite` returns the boolean status and suspends until it resolves. `useUpdateFavorite` returns the `favorite`/`unfavorite` actions plus `{isPending, error, reset}` and does not suspend. Both take the same props `useManageFavorite` did.

**Before:**

```tsx
function FavoriteButton(handle: UseFavoriteProps) {
  const {favorite, unfavorite, isFavorited} = useManageFavorite(handle)

  return (
    <Button
      onClick={() => (isFavorited ? unfavorite() : favorite())}
      text={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    />
  )
}
```

**After:**

```tsx
function FavoriteButton(handle: UseFavoriteProps) {
  const isFavorited = useFavorite(handle)
  const {favorite, unfavorite} = useUpdateFavorite(handle)

  return (
    <Button
      onClick={() => (isFavorited ? unfavorite() : favorite())}
      text={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    />
  )
}
```

### New in v3

Non-breaking additions:

- `useCheckPermissions` for resource-level permission checks.
- Applications hooks: `useApplication`, `useApplications`, `useUpdateApplication`, and `useDeleteApplication`.
- Installations hooks: `useInstallation` and `useInstallations`.
- A mutation hook layer. Mutation hooks return a `MutationHookResult`: `{mutate, isPending, error, data, reset}`.
- `AuthBoundary` no longer redirects to the login URL when running in the workbench, where the host OS owns the session and mints the token.

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
