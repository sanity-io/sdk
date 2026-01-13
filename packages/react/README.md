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

- `sanity.cli.ts` — configuration options used by the CLI — application metadata, deployment config, etc
- `src/App.tsx` — Root with `<SanityApp>` provider and project configuration(s)
- `src/ExampleComponent.tsx` — Your starting point

### 2. Project configuration

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

**Auth is automatic** — Dashboard injects an auth token via iframe. No custom login flow is needed for your application.

---

## Guide

### Document Handles

Document handles are a core concept for apps built with the App SDK. Document handles are minimal pointers to documents. They consist of the following properties:

```tsx
type DocumentHandle = {
  documentId: string
  documentType: string
  projectId?: string // optional if using the default projectId or inside a ResourceProvider
  dataset?: string // optional if using the default dataset or inside a ResourceProvider
}
```

**Best practice:** Fetch document handles first → pass them to child components → fetch individual document content from child components.

---

### Hook Reference

#### Data Retrieval

```tsx
// Get a collection of document handles (structured for infinite scrolling)
const {data, hasMore, loadMore, isPending, count} = useDocuments({
  documentType: 'article',
  batchSize: 20,
  orderings: [{field: '_updatedAt', direction: 'desc'}],
  filter: 'status == $status', // GROQ filter
  params: {status: 'published'}, // Parameters used for the GROQ filter
})

// Get a collection of document handles (structured for paginated lists)
const {data, currentPage, totalPages, nextPage, previousPage} = usePaginatedDocuments({
  documentType: 'article',
  pageSize: 10,
})

// Get content from a single document (live content, optimistic updates when used with useEditDocument)
const {data: doc} = useDocument(handle)
const {data: title} = useDocument({...handle, path: 'title'})

// Get a projection for an individual document (live content, no optimistic updates)
const {data} = useDocumentProjection({
  ...handle,
  projection: `{ title, "author": author->name, "imageUrl": image.asset->url }`,
})

// Use GROQ directly
const {data} = useQuery({
  query: `*[_type == "article" && featured == true][0...5]{ title, slug }`,
})
```

#### Document Manipulation

```tsx
// Edit field (emits optimistic updates to useEditDocument listeners, creates a draft automatically)
const editTitle = useEditDocument({...handle, path: 'title'})
editTitle('New Title') // fires on every keystroke, debounced internally

// Edit a nested path in a document
const editAuthorName = useEditDocument({...handle, path: 'author.name'})

// Document actions
import {
  useApplyDocumentActions,
  createDocumentHandle,
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

// Create new document with an optional initial content
const newHandle = createDocumentHandle({
  documentId: crypto.randomUUID(),
  documentType: 'article',
})
await apply(createDocument(newHandle, {title: 'Untitled', status: 'draft'}))
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
3. Apply the `createDocument` action using the document handle, along with optional initial content

```tsx
import {useApplyDocumentActions, createDocumentHandle, createDocument} from '@sanity/sdk-react'

function CreateArticleButton() {
  const apply = useApplyDocumentActions()

  const handleCreateArticle = () => {
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

  return <button onClick={handleCreateArticle}>Create Article</button>
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

All hooks that get or write data use React Suspense. Wrap all your components that fetch data with a Suspense boundary to avoid unnecessary re-renders:

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
        {/* Wrap each list item in its own Suspense boundary to prevent full list re-renders when one item updates */}
        <Suspense key={handle.documentId} fallback={<li>Loading...</li>}>
          <ArticleItem handle={handle} />
        </Suspense>
      ))}
    </ul>
  )
}
```

---

### Draft/Published Model

Sanity has two document states:

- **Published:** `_id: "abc123"` — live, public
- **Draft:** `_id: "drafts.abc123"` — working copy

The SDK handles updating the document state automatically:

- `useDocument()` returns draft if exists, else published
- `useEditDocument()` creates draft on first edit (automatic)
- `publishDocument()` copies draft → published, deletes draft
- `discardDraft()` deletes draft, reverts to published

#### LiveEdit Documents

For documents that don't need the draft/published workflow (such as settings, configuration, or real-time collaborative documents), you can use **liveEdit mode** by setting `liveEdit: true` in the document handle:

```tsx
const settingsHandle: DocumentHandle = {
  documentId: 'site-settings',
  documentType: 'settings',
  liveEdit: true, // Edits apply directly without creating a draft
}

// Edits are applied immediately to the published document
const editSettings = useEditDocument(settingsHandle)
```

**When using liveEdit documents:**

- Drafts will not be created when the document is edited
- Edits will be applied directly to the published document
- `publishDocument()`, `unpublishDocument()`, and `discardDraft()` actions cannot be used (since liveEdit documents are always published and do not have drafts)

For more details, see the [Sanity documentation on liveEdit documents](https://www.sanity.io/docs/content-lake/drafts).

---

### Real-Time Behavior

#### Live by Default

- Document changes from other users appear instantly
- No polling, uses Sanity's listener API
- Optimistic updates for local edits appear before the server confirms the updates

#### Re-render Triggers

Any mutation to a subscribed document (even fields you don't display) will trigger a re-render. Use `useDocumentProjection()` for read-only displays to minimize re-renders.

---

### Multi-Project Access

The SDK supports accessing documents from multiple projects and datasets simultaneously. There are two main approaches:

#### Approach 1: Specify Project/Dataset Directly in the Handle

Pass `projectId` and `dataset` directly in document handles to fetch data from specific projects (note that any `projectId` and `dataset` pair you pass must be defined in your application’s array of [SanityConfig objects](https://www.sanity.io/docs/app-sdk/sdk-configuration#d95b8773097c)):

```tsx
import {useDocument} from '@sanity/sdk-react'

function MultiProjectComponent() {
  // Fetch from Project A
  const {data: productA} = useDocument({
    documentId: 'product-123',
    documentType: 'product',
    projectId: 'project-a',
    dataset: 'production',
  })

  // Fetch from Project B
  const {data: productB} = useDocument({
    documentId: 'product-456',
    documentType: 'product',
    projectId: 'project-b',
    dataset: 'staging',
  })

  return (
    <div>
      <h2>{productA?.title} (Project A)</h2>
      <h2>{productB?.title} (Project B)</h2>
    </div>
  )
}
```

#### Approach 2: Use ResourceProvider to Set Context

Wrap components in `ResourceProvider` to set default project/dataset values for all child components:

```tsx
// App.tsx
import {ResourceProvider, useDocument, useSanityInstance} from '@sanity/sdk-react'

function ProductCard({productId}: {productId: string}) {
  // Get the current project/dataset from context
  const {config} = useSanityInstance()

  // No need to specify projectId/dataset - inherited from ResourceProvider
  const {data: product} = useDocument({
    documentId: productId,
    documentType: 'product',
  })

  return (
    <div>
      <h3>{product?.title}</h3>
      <p>
        From: {config.projectId}.{config.dataset}
      </p>
    </div>
  )
}

export function MultiProjectApp() {
  return (
    <div>
      {/* Products from Project A */}
      <ResourceProvider projectId="project-a" dataset="production" fallback={<div>Loading...</div>}>
        <h2>Project A Products</h2>
        <ProductCard productId="product-123" />
        <ProductCard productId="product-456" />
      </ResourceProvider>

      {/* Products from Project B */}
      <ResourceProvider projectId="project-b" dataset="staging" fallback={<div>Loading...</div>}>
        <h2>Project B Products</h2>
        <ProductCard productId="product-789" />
      </ResourceProvider>
    </div>
  )
}
```

**Key Points:**

- When using hooks that take document handles as arguments (such useDocument, useEditDocument, useQuery, etc.), the document handles’ `projectId` and `dataset` values can be explicitly set to fetch documents from arbitrary projects and datasets
- The ResourceProvider component is used to create a project ID and dataset context that child components will inherit from; this can negate the need to specify the project ID and dataset values for document handles in hooks called by child components
- Use `useSanityInstance()` to access the context configuration for the current component: `const {config} = useSanityInstance()`
- You can nest ResourceProvider components to create component trees with different project/dataset configurations — but be aware that, when the project ID and dataset values for document handles are _not_ specified, the project ID and dataset from the closest ResourceProvider context will be used

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

Add the resulting app ID to the `deployment` section of your `sanity.config.ts` file: `{deployment: { appId: "appbc1234", ... } }`.

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
  const editTitle = useEditDocument({...handle, path: 'title'})

  return <input value={title ?? ''} onChange={(e) => editTitle(e.target.value)} />
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
