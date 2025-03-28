---
title: Migration guide
---

## Migrating to @sanity/sdk-react@0.0.0-rc.2

⚠️ Breaking Changes

### Core to Dashboard Namespace Changes (Internal)

- All Core-related endpoints have been renamed to use the Dashboard namespace
- `core/v1/events/favorite` -> `dashboard/v1/events/favorite/mutate`
- `core/v1/events/history` -> `dashboard/v1/events/history`
- `core/v1/bridge/navigate-to-resource` -> `dashboard/v1/bridge/navigate-to-resource`
- `core/v1/bridge/context` -> `dashboard/v1/bridge/context`

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

- rename `results` to `data` for `useProjection` hook
- rename `result` to `data` for `usePreview` hook
