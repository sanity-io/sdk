# Migration Guide

## Migrating to @sanity/sdk-react@0.0.0-rc.3

This guide covers the key changes in the latest SDK version and how to update your code.

### Key Changes Overview

1. Improved component hierarchy with `<SanityApp />`, `<SDKProvider />`, and `<ResourceProvider />`
2. Simplified document references with explicit `projectId` + `dataset` fields
3. Standardized property names across the SDK
4. Unified hook interfaces with the handle pattern

### 1. Provider Components

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

#### For Advanced Use Cases

For more complex applications that need finer control, you can use `<SDKProvider />` or `<ResourceProvider />` directly:

```tsx
// Using SDKProvider directly
<SDKProvider
  config={[
    {projectId: 'abc12345', dataset: 'production'},
    {projectId: 'xyz12345', dataset: 'production'},
  ]}
  fallback={<>Loading…</>}
>
  <App />
</SDKProvider>

// Using ResourceProvider for full control
<ResourceProvider projectId="xyz12345" dataset="production">
  <ResourceProvider projectId="abc12345" dataset="production">
    <App />
  </ResourceProvider>
</ResourceProvider>
```

> 💡 **Tip**: See our [Advanced Resource Management Guide](../internal-guides/Advanced-Resource-Management.md) for more details on these components and when to use each one.

### 2. Document Handle Pattern

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

### 3. Hook Updates

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
const {data: documents} = useInfiniteList({
  filter: '_type == "product"',
  projectId: 'xyz12345', // Optional
  dataset: 'staging', // Optional
  pageSize: 20,
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

1. Component Changes:

   - `<SanityApp />` now uses `config` instead of `sanityConfigs`
   - `<SDKProvider />` now uses `config` prop for multiple configurations
   - `<ResourceProvider />` provides granular control for single configuration
   - `<SanityProvider />` removed

2. Property Renames:

   - `_type` → `documentType`
   - `_id` → `documentId`
   - `results` → `data` (in hook returns)
   - Removed `resourceId` concept

3. Interface Updates:
   - All document hooks use `DocumentHandle`
   - Query hooks accept `DatasetHandle`
   - Project hooks use `ProjectHandle`
   - Consistent handle pattern across SDK

---

## Migrating to @sanity/sdk-react@0.0.0-rc.2

⚠️ Breaking Changes

### Core to Dashboard Namespace Changes (Internal)

- All Core-related endpoints have been renamed to use the Dashboard namespace
- `core/v1/events/favorite` → `dashboard/v1/events/favorite/mutate`
- `core/v1/events/history` → `dashboard/v1/events/history`
- `core/v1/bridge/navigate-to-resource` → `dashboard/v1/bridge/navigate-to-resource`
- `core/v1/bridge/context` → `dashboard/v1/bridge/context`

### Hook Parameter Changes

#### `useManageFavorite`

```typescript
// Before
const {favorite, unfavorite, isFavorited} = useManageFavorite({
  _id: 'doc123',
  _type: 'book',
})

// After
const {favorite, unfavorite, isFavorited} = useManageFavorite({
  documentId: 'doc123',
  documentType: 'book',
  resourceType: 'studio', // Required
  resourceId: 'resource123', // Required for non-studio resources
})
```

#### `useRecordDocumentHistoryEvent`

```typescript
// Before
const {recordEvent} = useRecordDocumentHistoryEvent({
  _id: 'doc123',
  _type: 'book',
})

// After
const {recordEvent} = useRecordDocumentHistoryEvent({
  documentId: 'doc123',
  documentType: 'book',
  resourceType: 'studio', // Required
  resourceId: 'resource123', // Required for non-studio resources
})
```

---

## Migrating to @sanity/sdk-react@0.0.0-rc.1

### `results` -> `data`

- Renamed `results` to `data` in `useProjection`
- Renamed `result` to `data` in `usePreview`
