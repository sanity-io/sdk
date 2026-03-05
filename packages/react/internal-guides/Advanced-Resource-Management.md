# Advanced Resource Management in the Sanity App SDK

> **⚠️ Internal Implementation Guide**
>
> This guide covers internal implementation details of the Sanity App SDK's resource management system. It is intended for:
>
> - SDK implementers and maintainers
> - Contributors working on the codebase
> - Advanced users building complex multi-project/dataset applications
>
> Most users of the SDK don't need this level of detail.

## Introduction

This guide details the internal architecture behind the Sanity App SDK's resource management system. If you're working on the SDK itself or building advanced integrations, understanding these internals will help you make informed implementation decisions.

The SDK's resource management system was designed as a ["ladder API"](https://blog.sbensu.com/posts/apis-as-ladders/) - meaning it provides different levels of abstraction that you can climb as your needs grow:

- **First Step**: Most developers start with the convenient `<SanityApp>` component, which handles common use cases with minimal configuration.
- **Middle Steps**: As your needs grow, you can gradually learn about `ResourceProvider` and its configuration options.
- **Advanced Usage**: For complex scenarios, you can dive deep into instance management, store architecture, and advanced patterns.

This ladder approach means you can start simple and only learn the additional concepts when you need them. Understanding these concepts opens the door to more sophisticated use cases, like building multi-dataset experiences or creating dynamic applications that work across an entire organization's projects. Let's dive in!

## Core Components

### Component Hierarchy: SanityApp, SDKProvider, and ResourceProvider

At the heart of the SDK is a three-layered component hierarchy:

1. **SanityApp**: The public-facing component that users interact with
2. **SDKProvider**: A specialized component that creates the provider structure and adds in an `AuthBoundary`. Useful without a `SanityApp` for some use cases.
3. **ResourceProvider**: The foundational component that creates and manages Sanity instances

This layered approach provides both convenience for users and flexibility for implementation. Here's how it works:

```tsx
// User-facing API: SanityApp
<SanityApp
  resources={{
    default: { projectId: 'project1', dataset: 'production' },
    'other-project': { projectId: 'project2', dataset: 'production' },
  }}
  fallback={<Loading />}
>
  <App />
</SanityApp>

// Internally transforms to:
<SDKProvider
  resources={{
    default: { projectId: 'project1', dataset: 'production' },
    'other-project': { projectId: 'project2', dataset: 'production' },
  }}
  fallback={<Loading />}
>
  <App />
</SDKProvider>

// Which further creates this structure:
<ResourceProvider resource={{ projectId: 'project1', dataset: 'production' }} fallback={<Loading />}>
  <AuthBoundary projectIds={['project1', 'project2']}>
    <ResourcesContext.Provider value={resources}>
      <App />
    </ResourcesContext.Provider>
  </AuthBoundary>
</ResourceProvider>
```

### Implementation Details: Configuration and Resources

A critical implementation detail is how the `resources` map flows through the component tree:

1. **SanityApp** receives a `resources` map (named data sources) and an optional `config` (auth, studio, and perspective settings), then passes them to SDKProvider.
2. **SDKProvider** creates a single `ResourceProvider` with the default resource, and wraps children in `ResourcesContext.Provider` so hooks can resolve named resources.
3. **ResourceProvider** creates the `SanityInstance` and provides resource/perspective context.

```tsx
// In SanityApp.tsx:
export function SanityApp({
  children,
  fallback,
  config: configProp,
  resources: resourcesProp,
}: SanityAppProps): ReactElement {
  // Derive config and resources from Studio context if not provided
  const resolvedConfig = useMemo<SanityConfig>(() => {
    if (configProp) {
      return configProp
    }
    if (derived) return derived.config
    // ... fallback to SDKStudioContext
  }, [configProp, derived])

  return (
    <SDKProvider fallback={fallback} config={resolvedConfig} resources={resolvedResources}>
      {children}
    </SDKProvider>
  )
}

// In SDKProvider.tsx:
export function SDKProvider({
  children,
  config,
  resources = {},
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  const projectIds = useMemo(() => collectProjectIds(resources), [resources])
  const defaultResource = resources[DEFAULT_RESOURCE_NAME]

  return (
    <ResourceProvider resource={defaultResource} {...config} fallback={fallback}>
      <AuthBoundary projectIds={projectIds}>
        <ResourcesContext.Provider value={resources}>{children}</ResourcesContext.Provider>
      </AuthBoundary>
    </ResourceProvider>
  )
}
```

### Resource Providers and Instance Hierarchy

The `ResourceProvider` component creates and manages what we call "Sanity instances". When used at the root level, it creates a new `SanityInstance`. When nested, it provides `ResourceContext` and `PerspectiveContext` for the subtree without creating a new instance:

```tsx
// A basic example showing nested ResourceProviders
<ResourceProvider
  resource={{projectId: 'main-project', dataset: 'production'}}
  fallback={<Loading />}
>
  {/* This context uses the production dataset */}
  <ResourceProvider
    resource={{projectId: 'main-project', dataset: 'staging'}}
    fallback={<Loading />}
  >
    {/* This context uses the staging dataset */}
  </ResourceProvider>
</ResourceProvider>
```

### Instance Lifecycle and Resource Management

Each root `ResourceProvider` creates a Sanity instance with its own lifecycle. The SDK manages these instances and their resources following a simple pattern:

1. **Creation**: A new instance is born when a root `ResourceProvider` mounts
2. **Initialization**: Resources (like data connections) are created only when first needed
3. **Cleanup**: Everything gets cleaned up when the `ResourceProvider` unmounts

Here's how it looks in practice:

```tsx
function MyComponent() {
  return (
    <ResourceProvider
      resource={{projectId: 'project1', dataset: 'production'}}
      fallback={<Loading />}
    >
      {/* A new instance is created here */}
      <DataComponent />
      {/* When this component unmounts, the instance and all its resources are cleaned up */}
    </ResourceProvider>
  )
}
```

### Understanding Sanity Instances and Configuration

A "Sanity instance" is a self-contained unit that manages a specific configuration and its associated resources. Each instance has:

1. **Configuration**: A `SanityConfig` with auth, studio, perspective, and `defaultResource` settings
2. **Lifecycle Management**: A way to clean up resources when they're no longer needed

Here's what the technical structure looks like:

```typescript
interface SanityInstance {
  // A unique ID for this specific instance
  readonly instanceId: string

  // The configuration this instance is using
  readonly config: SanityConfig

  // Methods to manage its lifecycle
  isDisposed(): boolean
  dispose(): void
  onDispose(cb: () => void): () => void
}
```

#### Instance Usage in Practice

The SDK handles instance creation using React context. Here's a simplified look at how the `ResourceProvider` component works:

```tsx
function ResourceProvider({children, fallback, resource, ...rest}) {
  const parent = useContext(SanityInstanceContext)
  const rest = {perspective, auth, studio}
  const config: SanityConfig = useMemo(
    () => ({perspective, auth, studio}),
    [perspective, auth, studio],
  )

  if (parent) {
    // Nested: just provide new resource/perspective context
    return (
      <ResourceContext.Provider value={resource}>
        <PerspectiveContext.Provider value={config.perspective}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </PerspectiveContext.Provider>
      </ResourceContext.Provider>
    )
  }

  // Root: create a new SanityInstance
  const instance = useMemo(() => createSanityInstance(config), [rest])

  return (
    <SanityInstanceContext.Provider value={instance}>
      <ResourceContext.Provider value={resource}>
        <PerspectiveContext.Provider value={config.perspective}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </PerspectiveContext.Provider>
      </ResourceContext.Provider>
    </SanityInstanceContext.Provider>
  )
}
```

Components can access the current instance using the `useSanityInstance` hook:

```tsx
function MyComponent() {
  // Get the nearest instance
  const instance = useSanityInstance()

  // Now you can use the instance...
}
```

This system makes it possible to:

- Pass configuration down through your component tree
- Automatically clean up resources when components unmount
- Use React Suspense for elegant loading states

They can also access the current resource (that is, the "active" or "default" resource) by using the `useResourceHook` which is useful when specificity is needed:

```tsx
function canEditDocument(documentHandle: DocumentHandle) {
  const resource = useResource()

  // most non-hooks, like `editDocument`, come from @sanity/sdk, and require an explicit resource
  const editAction = editDocument({...documentHandle, resource})
  return canUseDocumentPermissions(editAction)
}
```

#### Configuration and Handles

Now, let's talk about "handles." The SDK uses a system of handle objects to make it easy to pass configuration between components. These handles form a simple hierarchy:

```typescript
// Perspective only
interface PerspectiveHandle {
  perspective?: string | ReleasePerspective
}

// Resource identification (required resource field)
interface ResourceHandle extends PerspectiveHandle {
  resource: DocumentResource // e.g. { projectId, dataset }, { mediaLibraryId }, or { canvasId }
}

// Document type within a resource
interface DocumentTypeHandle extends ResourceHandle {
  documentType: string
  liveEdit?: boolean
}

// A specific document within a resource
interface DocumentHandle extends DocumentTypeHandle {
  documentId: string
}

// The complete configuration
interface SanityConfig extends PerspectiveHandle {
  auth?: AuthConfig
  studio?: StudioConfig
  defaultResource?: DocumentResource
}
```

Handles flow naturally throughout your application:

- Resource Providers accept a `resource` prop
- Hooks accept handles as parameters, plus `resourceName` for named resource resolution
- Components can extend handles with their own properties

For example, here's a component that works with document handles:

```tsx
// A component that works with any document with address fields
function Address(docHandle: DocumentHandle) {
  // Get address fields from the document
  const {data} = useDocumentProjection({
    ...docHandle, // Pass along all the handle properties
    projection: '{address1, address2, city, state, "zipCode": zip}',
  })

  return (
    <div className="address">
      <div>{data.address1}</div>
      {data.address2 && <div>{data.address2}</div>}
      <div>
        {data.city}, {data.state} {data.zipCode}
      </div>
    </div>
  )
}
```

And here's how you can extend a handle with your own properties:

```tsx
// Define a component that extends DocumentHandle
interface DocumentPreviewProps extends DocumentHandle {
  showDescription?: boolean
}

function DocumentPreview({showDescription, ...docHandle}: DocumentPreviewProps) {
  // Use the handle properties plus your own custom ones
  const {data} = useDocumentProjection({
    ...docHandle,
    projection: showDescription ? '{name,description}' : '{name}',
  })

  return (
    <div className="preview">
      <h3>{data.name}</h3>
      {data.description && <p className="description">{data.description}</p>}
    </div>
  )
}
```

Now these components can be utilized with other APIs that operate with handles:

```tsx
function DocumentList() {
  // Returns document handles for all 'person' documents
  const {data} = useDocuments({
    documentType: 'person',
  })

  return (
    <ul>
      {data.map((docHandle) => (
        <li key={docHandle.documentId}>
          <Suspense fallback={<div>Loading...</div>}>
            <DocumentPreview {...docHandle} showDescription />
            <Address {...docHandle} />
          </Suspense>
        </li>
      ))}
    </ul>
  )
}
```

This handle-based approach gives you:

- **Extensibility**: You can easily add new properties when needed
- **Flexibility**: Components can work with partial configuration
- **Context Preservation**: Configuration flows naturally through your component tree

To further improve type safety, the SDK provides helper functions like `createDocumentHandle`, `createDocumentTypeHandle`, and `createResourceHandle` (defined in `@sanity/core`). These functions act primarily as identity functions at runtime but provide stronger type guarantees in TypeScript. They help capture literal types (e.g., `{ documentType: 'author' }` instead of `{ documentType: string }`) without requiring the use of `as const` on the handle object literal.

While you can still create handles using plain objects (especially with `as const` if needed for TypeScript), using these helper functions is recommended as it ensures the necessary type information is preserved for accurate type inference downstream in hooks like `useDocument`.

## Implementation Deep Dive: Store Architecture

Now let's look at how the SDK manages state. Behind the scenes, the SDK uses a flexible "store" system to keep track of data and coordinate resources across different instances.

### Store Definition and Initialization

A store is created using the `defineStore` function. When defining a store, you provide:

- A **name** to identify the store (helpful for debugging)
- An **initial state** function that provides the default state
- An optional **initialization** function that sets up any connections or listeners

Here's a simple example:

```typescript
const myStore = defineStore<MyState>({
  name: 'MyStore',
  getInitialState: () => ({
    // Your default state goes here
    items: [],
    isLoading: false,
  }),
  initialize: ({state, instance}) => {
    // Set up any connections or subscriptions
    const subscription = setupDataConnection({instance, state})

    // Return a cleanup function
    return () => {
      // Clean up when no longer needed
      subscription.unsubscribe()
    }
  },
})
```

Think of this like creating a blueprint for a store. It defines what the store contains and how it behaves, but it doesn't create the actual store instance yet.

### Store Instance Creation

When a store is actually needed, the SDK creates a "store instance" tied to a specific Sanity instance. This store instance:

- Creates a reactive state container to track changes
- Connects the store to the specific Sanity instance
- Sets up proper cleanup when the instance is disposed

```ts
export function createStoreInstance<TState>(
  instance: SanityInstance,
  {name, getInitialState, initialize}: StoreDefinition<TState>,
): StoreInstance<TState> {
  const state = createStoreState(getInitialState(instance), {
    enabled: !!getEnv('DEV'),
    name: `${name}-${instance.instanceId}`,
  })
  const dispose = initialize?.({state, instance})
  const disposed = {current: false}

  return {
    state,
    dispose: () => {
      if (disposed.current) return
      disposed.current = true
      dispose?.()
    },
    isDisposed: () => disposed.current,
  }
}
```

The smart part is that each store instance is isolated to its own context. For example, a document store for "project1/production" is separate from a document store for "project1/staging" - they don't interfere with each other and the implementation can remain simple operating on a single dataset.

### Action Binding and State Updates

To interact with stores, the SDK uses "action binding" - a pattern where functions are connected (or "bound") to specific store instances. When you call a bound store action, it automatically knows which store instance to use. Importantly, stores are lazily initialized - they aren't created until the first time an action is called. This approach both simplifies state management and optimizes performance by only creating store instances when they're actually needed.

There are two main ways actions are bound to stores:

1. **Global Binding** (`bindActionGlobally`): Creates one shared store instance that all Sanity instances access together, regardless of their `instance.config` - useful for app-wide state like authentication
2. **Resource Binding** (`bindActionByResource`): Creates independent store instances based on the `resource` passed to the action - keeping data properly isolated between different resources

Here's a simplified look at how the action binding system works:

```typescript
function createActionBinder(keyFn: (instance, options) => string) {
  // Track store instances and which Sanity instances use them
  const instanceRegistry = new Map<string, Set<string>>()
  const storeRegistry = new Map<string, StoreInstance<unknown>>()

  return function bindAction(storeDefinition, action) {
    return function boundAction(instance, ...params) {
      // Generate a unique key for this store instance
      const key = `${storeDefinition.name}:${keyFn(instance, params[0])}`

      // Get or create set of instances using this store
      let instances = instanceRegistry.get(key)
      if (!instances) {
        instances = new Set()
        instanceRegistry.set(key, instances)
      }

      // Track this instance for cleanup
      if (!instances.has(instance.instanceId)) {
        instances.add(instance.instanceId)

        // Clean up when instance is disposed
        instance.onDispose(() => {
          instances.delete(instance.instanceId)

          // If no instances left, clean up store
          if (instances.size === 0) {
            storeRegistry.get(key)?.dispose()
            storeRegistry.delete(key)
            instanceRegistry.delete(key)
          }
        })
      }

      // Get or create store instance
      let store = storeRegistry.get(key)
      if (!store) {
        store = createStoreInstance(instance, storeDefinition)
        storeRegistry.set(key, store)
      }

      // Execute action with store context
      return action({instance, state: store.state}, ...params)
    }
  }
}

// Create resource-specific stores (keyed by document resource)
const bindActionByResource = createActionBinder((instance, {resource}) => {
  return createResourceKey(instance, resource)
})

// Create globally shared stores
const bindActionGlobally = createActionBinder(() => 'global')
```

The action binding system is responsible for:

1. **Store Instance Management**: Creating and tracking store instances based on unique keys
2. **Resource Cleanup**: Ensuring stores are cleaned up when no instances are using them
3. **State Isolation**: Keeping state separate between different resources (for resource-bound stores)
4. **State Sharing**: Allowing state to be shared across all instances (for global stores)

Behind the scenes, the binding system:

1. Determines which store instance to use based on the Sanity instance and the resource
2. Creates a new store instance if one doesn't exist yet
3. Executes the action with the right store state

Here's a simple example:

```typescript
// This action is bound globally - all instances share the same auth state
const getCurrentUser = bindActionGlobally(authStore, ({state}) => state.get().user)

// This action is bound by resource - each resource has its own documents
const getDocuments = bindActionByResource(documentStore, ({state}) => state.get().documents)
```

## Seeing It All In Action: A Complex Example

Let's tie everything together with a complete example that demonstrates these concepts in action. Here's a project explorer that lets you navigate through projects, datasets, and document types:

```tsx
import {
  DocumentHandle,
  ResourceProvider,
  useDatasets,
  usePaginatedDocuments,
  useDocumentProjection,
  useProjects,
  useQuery,
} from '@sanity/sdk-react'
import {Suspense, useState} from 'react'

const fallback = <>Loading…</>

function ProjectExplorer() {
  // Track which project is selected
  const [selectedProjectId, setSelectedProjectId] = useState('')

  // Get all available projects
  const projects = useProjects()

  return (
    <div>
      {/* Project Selection */}
      <div>
        <label htmlFor="project-select">Select Project:</label>
        <select
          id="project-select"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          <option value="">Choose a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.displayName || project.id}
            </option>
          ))}
        </select>
      </div>

      {/* Create a new resource boundary when a project is selected */}
      {selectedProjectId && (
        <Suspense fallback={fallback}>
          <Datasets projectId={selectedProjectId} />
        </Suspense>
      )}
    </div>
  )
}

function Datasets({projectId}: {projectId: string}) {
  // Track which dataset is selected
  const [selectedDataset, setSelectedDataset] = useState('')

  // Get datasets for the current project (requires explicit projectId in v3)
  const datasets = useDatasets({projectId})

  return (
    <div>
      <label htmlFor="dataset-select">Select Dataset:</label>
      <select
        id="dataset-select"
        value={selectedDataset}
        onChange={(e) => setSelectedDataset(e.target.value)}
      >
        <option value="">Choose a dataset...</option>
        {datasets.map((dataset) => (
          <option key={dataset.name} value={dataset.name}>
            {dataset.name}
          </option>
        ))}
      </select>

      {/* Create another resource boundary when a dataset is selected */}
      {selectedDataset && (
        <ResourceProvider resource={{projectId, dataset: selectedDataset}} fallback={fallback}>
          <DocumentTypes />
        </ResourceProvider>
      )}
    </div>
  )
}

function DocumentTypes() {
  // Track which document type is selected
  const [selectedType, setSelectedType] = useState('')

  // Get all unique document types in this dataset
  const {data: documentTypes} = useQuery({query: 'array::unique(*[]._type)'})

  return (
    <div>
      <label htmlFor="type-select">Select Document Type:</label>
      <select
        id="type-select"
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
      >
        <option value="">Choose a type...</option>
        {documentTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      {/* Show documents when a type is selected */}
      {selectedType && <DocumentList type={selectedType} />}
    </div>
  )
}

function DocumentList({type}) {
  // Get a paginated list of documents
  const {data: docHandles} = usePaginatedDocuments({
    documentType: type,
    pageSize: 10,
  })

  return (
    <ul>
      {docHandles.map((docHandle) => (
        <li key={docHandle.documentId}>
          {/* Individual Suspense boundary for each document */}
          <Suspense fallback={fallback}>
            <DocumentPreview {...docHandle} />
          </Suspense>
        </li>
      ))}
    </ul>
  )
}

function DocumentPreview(docHandle: DocumentHandle) {
  // Get just the title field from the document
  const {data} = useDocumentProjection<{title?: string}>({
    ...docHandle,
    projection: '{title}',
  })

  return <>{data.title}</>
}
```

This example shows several key patterns in action:

1. **Progressive Resource Creation**

- Each level waits for selections before creating ResourceProviders
- Resources are only initialized when needed
- Clean boundaries between different configuration contexts

2. **Handle Usage**

- Document handles from `usePaginatedDocuments` preserve all context
- Handles are spread into components like `DocumentPreview`
- Components remain agnostic about where their data comes from

3. **Smart Resource Management**

- When selections change, old resources are automatically cleaned up
- Suspense boundaries provide loading states at appropriate levels
- State is isolated appropriately (project list vs. dataset-specific data)

You can extend this pattern for more complex scenarios too:

```tsx
// Example: Adding an environment toggle
function DatasetExplorer({projectId}: {projectId: string}) {
  const [environment, setEnvironment] = useState('production')

  return (
    <ResourceProvider
      resource={{projectId, dataset: environment === 'production' ? 'production' : 'staging'}}
      fallback={<Loading />}
    >
      <EnvironmentToggle value={environment} onChange={setEnvironment} />
      <DocumentExplorer />
    </ResourceProvider>
  )
}
```

## Best Practices for Implementation

When implementing or modifying the SDK's resource management system, keep these guidelines in mind:

1. **Maintain the Component Hierarchy**

- SanityApp should remain the public API
- SDKProvider should handle creating the single instance and providing resources context
- ResourceProvider should focus on instance management and resource/perspective context

2. **Named Resources are the Primary Pattern**

- The `resources` map on `SanityApp` is the recommended way to declare data sources
- Hooks resolve resources through `ResourcesContext` when given a `resourceName`
- The `"default"` resource is used as the fallback when no explicit resource is specified

3. **Isolate Internal Components**

- Mark internal components with `@internal` JSDoc tags
- Keep implementation details out of public documentation
- Provide clear prop interfaces for all components

4. **Ensure Proper Resource Cleanup**

- Every resource creation should have a corresponding cleanup
- Use the instance dispose mechanism consistently
- Test with multiple mounting/unmounting scenarios

5. **Choose the Right Binding Type**

- Use global binding for state that should be shared everywhere (like authentication)
- Use resource binding for data that's specific to a particular resource
- Clearly document which pattern is used for each store

## Conclusion

The Sanity App SDK's resource management system provides a powerful foundation for building sophisticated applications. By understanding these internal implementation details, you can maintain and extend the SDK effectively while preserving its consistent behavior for end users.

Whether building a simple single-project app or a complex multi-resource experience, these patterns enable efficient resource management, clean component hierarchies, and maintainable code architecture.
