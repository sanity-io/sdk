<p align="center">
  <a href="https://sanity.io">
    <img src="https://cdn.sanity.io/images/3do82whm/next/d6cf401d52c33b7a5a354a14ab7de94dea2f0c02-192x192.svg" />
  </a>
  <h1 align="center">Sanity App SDK (React)</h1>
</p>

React hooks for creating Sanity applications. Live by default, optimistic updates, multi-project support.

---

## Quickstart

### 1. Setup (2 min)

```bash
npx sanity@latest init --template app-quickstart
cd your-app
npm run dev
```

Opens at `https://www.sanity.io/welcome?dev=http%3A%2F%2Flocalhost%3A3333`, proxied through Sanity Dashboard for auth.

**Key files:**

- `sanity.cli.ts` — CLI config, app entry point
- `src/App.tsx` — Root with `<SanityApp>` provider
- `src/ExampleComponent.tsx` — Your starting point

### 2. Configuration

```tsx
import {SanityApp, type SanityConfig} from '@sanity/sdk-react'

const config: SanityConfig[] = [
  {projectId: 'abc123', dataset: 'production'},
  {projectId: 'def456', dataset: 'production'}, // multi-project support
]

export function App() {
  return (
    <SanityApp config={config} fallback={<div>Loading...</div>}>
      <YourApp />
    </SanityApp>
  )
}
```

**Auth is automatic** — Dashboard injects token via iframe. No login flow needed.

---

## Guide

### Document Handles

As a core concept, everything revolves around handles — minimal pointers to documents:

```tsx
type DocumentHandle = {
  documentId: string
  documentType: string
  projectId?: string // optional if using the default projectId or inside a ResourceProvider
  dataset?: string // optional if using the default dataset or inside a ResourceProvider
}
```

**Pattern:** Fetch handles first → pass to child components → fetch content there.

---

### Hook Reference

#### Data Retrieval

```tsx
// Collection of handles (infinite scroll)
const {data, hasMore, loadMore, isPending, count} = useDocuments({
  documentType: 'article',
  batchSize: 20,
  orderings: [{field: '_updatedAt', direction: 'desc'}],
  filter: 'status == "published"', // GROQ filter
  params: {status: 'published'}, // filter params
})

// Paginated (discrete pages)
const {data, currentPage, totalPages, nextPage, previousPage} = usePaginatedDocuments({
  documentType: 'article',
  pageSize: 10,
})

// Single document (live, optimistic)
const {data: doc} = useDocument(handle)
const {data: title} = useDocument({...handle, path: 'title'})

// Projection (live, no optimistic updates)
const {data} = useDocumentProjection({
  ...handle,
  projection: `{ title, "author": author->name, "imageUrl": image.asset->url }`,
})

// Raw GROQ
const {data} = useQuery({
  query: `*[_type == "article" && featured == true][0...5]{ title, slug }`,
})
```

#### Document Manipulation

```tsx
// Edit field (optimistic, creates draft automatically)
const editTitle = useEditDocument({...handle, path: 'title'})
editTitle('New Title') // fires on every keystroke, debounced internally

// Edit nested path
const editAuthorName = useEditDocument({...handle, path: 'author.name'})

// Document actions
import {
  useApplyDocumentActions,
  publishDocument,
  unpublishDocument,
  deleteDocument,
  createDocument,
  discardDraft,
} from '@sanity/sdk-react'

const apply = useApplyDocumentActions()

// Single action
await apply(publishDocument(handle))

// Batch actions
await apply([publishDocument(handle1), publishDocument(handle2), deleteDocument(handle3)])

// Create new document
await apply(
  createDocument({
    documentType: 'article',
    initialValue: {title: 'Untitled', status: 'draft'},
  }),
)
```

#### Events & Permissions

```tsx
// Subscribe to document events
useDocumentEvent({
  ...handle,
  onEvent: (event) => {
    // event.type: 'documentEdited' | 'documentPublished' | 'documentDeleted' | ...
    console.log(event.type, event.documentId)
  },
})

// Check permissions
const {data: canEdit} = useDocumentPermissions({
  ...handle,
  permission: 'update',
})
const {data: canPublish} = useDocumentPermissions({
  ...handle,
  permission: 'publish',
})
```

---

### Document Actions

The `useApplyDocumentActions` hook is used to perform document lifecycle operations. Actions are created using helper functions and applied through the `apply` function.

#### Available Action Creators

| Function            | Description                                    |
| ------------------- | ---------------------------------------------- |
| `createDocument`    | Create a new document                          |
| `publishDocument`   | Publish a draft (copy draft → published)       |
| `unpublishDocument` | Unpublish (delete published, keep draft)       |
| `deleteDocument`    | Delete document entirely (draft and published) |
| `discardDraft`      | Discard draft changes, revert to published     |

#### Creating Documents

To create a document, you must:

1. Generate your own document ID (using `crypto.randomUUID()`)
2. Create a document handle with `createDocumentHandle`
3. Apply the `createDocument` action with initial data

```tsx
import {useApplyDocumentActions, createDocumentHandle, createDocument} from '@sanity/sdk-react'

function CreateArticleButton() {
  const apply = useApplyDocumentActions()

  const handleCreate = () => {
    const newId = crypto.randomUUID()
    const handle = createDocumentHandle({
      documentId: newId,
      documentType: 'article',
    })

    apply(
      createDocument(handle, {
        title: 'New Article',
        status: 'draft',
        author: {_type: 'reference', _ref: 'author-123'},
      }),
    )

    // Navigate to the new document
    navigate(`/articles/${newId}`)
  }

  return <button onClick={handleCreate}>Create Article</button>
}
```

#### Publishing Documents

```tsx
import {useApplyDocumentActions, publishDocument, useDocument} from '@sanity/sdk-react'

function PublishButton({handle}: {handle: DocumentHandle}) {
  const apply = useApplyDocumentActions()
  const {data: doc} = useDocument(handle)

  // Check if document has unpublished changes (is a draft)
  const isDraft = doc?._id?.startsWith('drafts.')

  return (
    <button disabled={!isDraft} onClick={() => apply(publishDocument(handle))}>
      Publish
    </button>
  )
}
```

#### Deleting Documents

```tsx
import {useApplyDocumentActions, deleteDocument} from '@sanity/sdk-react'

function DeleteButton({handle}: {handle: DocumentHandle}) {
  const apply = useApplyDocumentActions()

  const handleDelete = () => {
    if (confirm('Are you sure?')) {
      apply(deleteDocument(handle))
    }
  }

  return <button onClick={handleDelete}>Delete</button>
}
```

#### Batch Operations

Apply multiple actions as a single transaction:

```tsx
const apply = useApplyDocumentActions()

// Create and immediately publish
const newHandle = createDocumentHandle({
  documentId: crypto.randomUUID(),
  documentType: 'article',
})

apply([createDocument(newHandle, {title: 'Breaking News'}), publishDocument(newHandle)])

// Publish multiple documents at once
apply([publishDocument(handle1), publishDocument(handle2), publishDocument(handle3)])
```

---

### Suspense Pattern

All data hooks use React Suspense. Wrap components that fetch:

```tsx
function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ArticleList />
    </Suspense>
  )
}

function ArticleList() {
  const {data: articles} = useDocuments({documentType: 'article'})

  return (
    <ul>
      {articles.map((handle) => (
        <Suspense key={handle.documentId} fallback={<li>Loading...</li>}>
          <ArticleItem handle={handle} />
        </Suspense>
      ))}
    </ul>
  )
}
```

**Key insight:** Wrap each list item in its own Suspense boundary. Prevents full-list re-renders when one item updates.

---

### Draft/Published Model

Sanity has two document states:

- **Published:** `_id: "abc123"` — live, public
- **Draft:** `_id: "drafts.abc123"` — working copy

The SDK handles this transparently:

- `useDocument()` returns draft if exists, else published
- `useEditDocument()` creates draft on first edit (automatic)
- `publishDocument()` copies draft → published, deletes draft
- `discardDraft()` deletes draft, reverts to published

---

### Real-Time Behavior

#### Live by Default

- Document changes from other users appear instantly
- No polling, uses Sanity's listener API
- Optimistic updates for local edits (appear before server confirms)

#### Re-render Triggers

- Any mutation to a subscribed document (even fields you don't display)
- Use `useDocumentProjection()` for read-only displays to minimize re-renders

---

### Multi-Project Access

#### Specify Source in Handle

```tsx
const handle: DocumentHandle = {
  documentId: 'xyz',
  documentType: 'product',
  projectId: 'project-a',
  dataset: 'production',
}
```

#### Use Resource Provider Context

```tsx
// App.tsx
import {ResourceProvider} from '@sanity/sdk-react'
;<ResourceProvider projectId="project-a" dataset="production">
  <ProductCard productId="xyz" />
</ResourceProvider>

// ProductCard.tsx
import {useProjectId, useDataset} from '@sanity/sdk-react'

function ProductCard({productId}: {productId: string}) {
  const projectId = useProjectId() // "project-a" from nearest configured ResourceProvider
  const dataset = useDataset() // "production" from nearest configured ResourceProvider
  // ...
}
```

---

### TypeScript & TypeGen

```bash
# Generate types from your schema
npx sanity typegen generate
```

```tsx
import type {Article} from './sanity.types'

const {data} = useDocument<Article>(handle)
// data is typed as Article
```

---

### Deployment

```bash
npx sanity deploy
```

Add the resulting app ID to a `deploy` property in your `sanity.config.ts` file: `{appId: "appbc1234", ... }`.

App appears in Sanity Dashboard alongside Studios. Requires `sanity.sdk.applications.deploy` permission.

---

### UI Options

SDK is headless. Common choices:

```bash
# Sanity UI (matches Studio aesthetic)
npm install @sanity/ui @sanity/icons styled-components

# Tailwind
npm install tailwindcss @tailwindcss/vite
```

#### Tailwind Setup

Tailwind requires a few extra steps since the App SDK uses Vite internally.

1. **Install dependencies:**

```bash
npm install tailwindcss @tailwindcss/vite
```

2. **Configure the Vite plugin in `sanity.cli.ts`:**

```ts
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: 'your-org-id',
    entry: './src/App.tsx',
  },
  vite: async (viteConfig) => {
    const {default: tailwindcss} = await import('@tailwindcss/vite')
    return {
      ...viteConfig,
      plugins: [...viteConfig.plugins, tailwindcss()],
    }
  },
})
```

3. **Import Tailwind in your CSS (e.g., `src/App.css`):**

```css
@import 'tailwindcss';
```

4. **Import the CSS in your app:**

```tsx
// src/App.tsx
import './App.css'
```

Now you can use Tailwind classes in your components.

#### Portable Text Editor

Use `@portabletext/plugin-sdk-value` to connect a Portable Text Editor with a Sanity document field. It provides two-way sync, real-time collaboration, and optimistic updates.

1. **Install dependencies:**

```bash
npm install @portabletext/editor @portabletext/plugin-sdk-value
```

2. **Use in a component:**

```tsx
import {defineSchema, EditorProvider, PortableTextEditable} from '@portabletext/editor'
import {SDKValuePlugin} from '@portabletext/plugin-sdk-value'

function MyEditor({documentId}: {documentId: string}) {
  return (
    <EditorProvider initialConfig={{schemaDefinition: defineSchema({})}}>
      <PortableTextEditable />
      <SDKValuePlugin documentId={documentId} documentType="article" path="content" />
    </EditorProvider>
  )
}
```

##### SDKValuePlugin Props

| Prop           | Type                | Description                               |
| -------------- | ------------------- | ----------------------------------------- |
| `documentId`   | `string`            | The document ID                           |
| `documentType` | `string`            | The document type                         |
| `path`         | `string`            | JSONMatch path to the Portable Text field |
| `dataset`      | `string` (optional) | Dataset name if different from default    |
| `projectId`    | `string` (optional) | Project ID if different from default      |

**The plugin handles:**

- Two-way sync between editor and document
- Real-time updates from other users
- Optimistic updates for smooth UX

---

### Common Patterns

#### Editable List Item

```tsx
function EditableTitle({handle}: {handle: DocumentHandle}) {
  const {data: title} = useDocument({...handle, path: 'title'})
  const edit = useEditDocument({...handle, path: 'title'})

  return <input value={title ?? ''} onChange={(e) => edit(e.target.value)} />
}
```

#### Publish Button with Permission Check

```tsx
function PublishButton({handle}: {handle: DocumentHandle}) {
  const {data: canPublish} = useDocumentPermissions({
    ...handle,
    permission: 'publish',
  })
  const apply = useApplyDocumentActions()

  if (!canPublish) return null

  return <button onClick={() => apply(publishDocument(handle))}>Publish</button>
}
```

#### Document Status Indicator

```tsx
function DocStatus({handle}: {handle: DocumentHandle}) {
  const {data: published} = useDocumentProjection({
    documentId: handle.documentId, // without drafts. prefix
    documentType: handle.documentType,
    projection: '{ _updatedAt }',
  })

  const {data: draft} = useDocumentProjection({
    documentId: `drafts.${handle.documentId}`,
    documentType: handle.documentType,
    projection: '{ _updatedAt }',
  })

  if (draft && published) return <span>Modified</span>
  if (draft) return <span>Draft</span>
  if (published) return <span>Published</span>
  return <span>New</span>
}
```

---

## Quick Reference

| Task                  | Hook/Function                               |
| --------------------- | ------------------------------------------- |
| List documents        | `useDocuments`, `usePaginatedDocuments`     |
| Read document         | `useDocument`, `useDocumentProjection`      |
| Edit field            | `useEditDocument`                           |
| Publish/Delete/Create | `useApplyDocumentActions` + action creators |
| GROQ query            | `useQuery`                                  |
| Check permissions     | `useDocumentPermissions`                    |
| Listen to changes     | `useDocumentEvent`                          |

---

## Documentation

- **[Sanity Docs](https://sanity.io/docs/app-sdk)** — Conceptual overview, quickstart guide, and step-by-step walkthrough
- **[App SDK Reference](https://reference.sanity.io/_sanity/sdk-react)** — In-depth API documentation
- **[SDK Explorer](https://sdk-explorer.sanity.io)** — Example implementations
- **[Migration Guide](./guides/0-Migration-Guide.md)** — Upgrading from previous versions
- **[Learn Course](https://www.sanity.io/learn/course/build-content-apps-with-sanity-app-sdk)** — Interactive video tutorial

## License

MIT © Sanity.io
