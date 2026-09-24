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
3. **ResourceProvider**: The foundational component that provides resource and perspective context and owns the root Sanity instance

This layered approach provides both convenience for users and flexibility for implementation. Here's how it works:

```tsx
// User-facing API: SanityApp
<SanityApp
  config={[
    { projectId: 'project1', dataset: 'production' },
    { projectId: 'project2', dataset: 'production' }
  ]}
  fallback={<Loading />}
>
  <App />
</SanityApp>

// Internally passes the configurations to SDKProvider:
<SDKProvider
  config={[
    { projectId: 'project1', dataset: 'production' },
    { projectId: 'project2', dataset: 'production' }
  ]}
  fallback={<Loading />}
>
  <App />
</SDKProvider>

// SDKProvider uses the first configuration as the default resource:
<ResourceProvider
  projectId="project1"
  dataset="production"
  resource={{projectId: 'project1', dataset: 'production'}}
  fallback={<Loading />}
>
  <AuthBoundary>
    <OrganizationResourcesProvider resources={resources}>
      <App />
    </OrganizationResourcesProvider>
  </AuthBoundary>
</ResourceProvider>
```

### Implementation Details: Default Configuration and Resources

A critical implementation detail is how the default configuration and resources are selected:

1. **SanityApp** receives configurations and passes them to SDKProvider
2. **SDKProvider** uses the first configuration as the default configuration and converts its project/dataset pair into the resource named `default`, unless an explicit `resources.default` was supplied
3. **ResourceProvider** creates one Sanity instance at the root; nested ResourceProviders reuse that instance while overriding resource or perspective context

```tsx
// In SanityApp.tsx:
export function SanityApp({children, fallback, config}: SanityAppProps): ReactElement {
  return (
    <SDKProvider {...restProps} fallback={fallback} config={config}>
      {children}
    </SDKProvider>
  )
}

// In SDKProvider.tsx:
export function SDKProvider({
  children,
  config,
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  const defaultConfig = Array.isArray(config) ? config[0] : config
  const resources = {
    ...(defaultConfig?.projectId && defaultConfig.dataset
      ? {default: {projectId: defaultConfig.projectId, dataset: defaultConfig.dataset}}
      : {}),
    ...props.resources,
  }

  return (
    <ResourceProvider {...defaultConfig} resource={resources.default} fallback={fallback}>
      <AuthBoundary {...props}>
        <OrganizationResourcesProvider resources={resources}>
          {children}
        </OrganizationResourcesProvider>
      </AuthBoundary>
    </ResourceProvider>
  )
}
```

The first configuration remains the default for compatibility. For multi-resource applications, prefer the `resources` prop and select a named resource with `resourceName`, or use a `ResourceProvider` to change the default resource for a subtree.

### Resource Providers and Resource Hierarchy

The root `ResourceProvider` creates and manages a Sanity instance. Nested providers reuse that instance while inheriting and overriding resource or perspective context as needed. This design provides flexibility while maintaining clear resource boundaries:

```tsx
// A basic example showing nested ResourceProviders with resource overrides
<ResourceProvider
  resource={{projectId: 'main-project', dataset: 'production'}}
  fallback={<Loading />}
>
  <ResourceProvider
    resource={{projectId: 'main-project', dataset: 'staging'}}
    fallback={<Loading />}
  >
    {/* This subtree uses staging while reusing the same Sanity instance */}
  </ResourceProvider>
</ResourceProvider>
```

### Instance Lifecycle and Resource Management

The root `ResourceProvider` creates a Sanity instance with its own lifecycle. Nested ResourceProviders reuse it. The SDK manages the instance and its resources following a simple pattern:

1. **Creation**: A new instance is born when a root `ResourceProvider` mounts
2. **Initialization**: Resources (like data connections) are created only when first needed
3. **Cleanup**: Everything gets cleaned up when the root `ResourceProvider` unmounts

Here's how it looks when `ResourceProvider` is mounted without a parent Sanity instance (for
example, when used as the application root):

```tsx
function MyComponent() {
  return (
    <ResourceProvider projectId="project1" dataset="production" fallback={<Loading />}>
      {/* With no parent instance, this root provider creates one */}
      <DataComponent />
      {/* When the root provider unmounts, its instance and resources are cleaned up */}
    </ResourceProvider>
  )
}
```

### Understanding Sanity Instances and Configuration

A "Sanity instance" is a self-contained unit that manages application configuration and associated resources. Each instance has:

1. **Configuration**: Settings like which project and dataset to use
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
function ResourceProvider({children, fallback, resource, ...config}) {
  // Check if we have a parent instance
  const parent = useContext(SanityInstanceContext)
  const parentResource = useContext(ResourceContext)
  const parentPerspective = useContext(PerspectiveContext)
  const parentProjectId = useContext(ProjectContext)
  const {projectId, dataset, perspective} = config

  // Create an instance only at the root; nested providers reuse it
  const [instance] = useState(() => parent ?? createSanityInstance(config))

  // Legacy compatibility: a dataset-only provider inherits its parent project
  const configResource =
    projectId && dataset
      ? {projectId, dataset}
      : dataset && parentProjectId
        ? {projectId: parentProjectId, dataset}
        : undefined

  // Legacy compatibility: a bare projectId creates project scope, not a resource
  const effectiveResource = resource ?? configResource ?? (projectId ? undefined : parentResource)
  const effectiveProjectId =
    effectiveResource && isDatasetResource(effectiveResource)
      ? effectiveResource.projectId
      : (projectId ?? parentProjectId)

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      // Strict Mode's deferred/cancelable disposal handling is omitted here
      if (!instance.isDisposed() && instance !== parent) instance.dispose()
    }
  }, [instance, parent])

  // Provide the shared instance and this subtree's project/resource/perspective
  return (
    <SanityInstanceProvider instance={instance} fallback={fallback}>
      <ResourceContext.Provider value={effectiveResource}>
        <ProjectContext.Provider value={effectiveProjectId}>
          <PerspectiveContext.Provider value={perspective ?? parentPerspective}>
            {children}
          </PerspectiveContext.Provider>
        </ProjectContext.Provider>
      </ResourceContext.Provider>
    </SanityInstanceProvider>
  )
}
```

Components can then access the current instance with `useSanityInstance`, inspect the current resource with `useResource`, or select another resource in a hook's options:

```tsx
function MyComponent() {
  // Get the nearest instance
  const instance = useSanityInstance()

  // Get the active resource for this subtree
  const resource = useResource()

  // Or select a named resource for an operation
  const {data} = useDocuments({documentType: 'article', resourceName: 'production'})
}
```

Here is the implementation of `useSanityInstance`:

```ts
export const useSanityInstance = (): SanityInstance => {
  const instance = useContext(SanityInstanceContext)

  if (!instance) {
    throw new Error(`SanityInstance context not found.`)
  }

  return instance
}
```

This system makes it possible to:

- Pass configuration down through your component tree
- Select resources explicitly or through resource context when you need them
- Automatically clean up resources when components unmount
- Use React Suspense for elegant loading states

#### Configuration and Handles

Now, let's talk about "handles." The SDK uses a system of handle objects to make it easy to pass configuration between components. These handles form a simple hierarchy:

```typescript
// Just project information
interface ProjectHandle {
  projectId?: string
}

// Project plus dataset information
interface DatasetHandle extends ProjectHandle {
  dataset?: string
  resource?: DocumentResource
  perspective?: ClientPerspective | ReleasePerspective
}

// The complete configuration
interface SanityConfig extends DatasetHandle {
  auth?: AuthConfig
}
```

Handles flow naturally throughout your application:

- Resource Providers accept configuration as props
- Hooks accept handles as parameters
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
    filter: '_type == $type',
    params: {type: 'person'},
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

To further improve type safety and facilitate integration with tools like Sanity Typegen, the SDK provides helper functions like `createDocumentHandle`, `createDocumentTypeHandle`, `createProjectHandle`, and `createDatasetHandle` (defined in `@sanity/sdk` and re-exported by `@sanity/sdk-react`). These functions act primarily as identity functions at runtime but provide stronger type guarantees in TypeScript. They help capture literal types (e.g., `{ documentType: 'author' }` instead of `{ documentType: string }`) without requiring the use of `as const` on the handle object literal.

While you can still create handles using plain objects (especially with `as const` if needed for Typescript), using these helper functions is recommended, particularly when leveraging Typegen, as it ensures the necessary type information is preserved for accurate type inference downstream in hooks like `useDocument`.

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
export function createStoreInstance<TState, TKey extends {name: string}>(
  instance: SanityInstance,
  key: TKey,
  {name, getInitialState, initialize}: StoreDefinition<TState, TKey>,
): StoreInstance<TState> {
  const state = createStoreState(getInitialState(instance, key), {
    enabled: !!getEnv('DEV'),
    name: `${name}-${key.name}`,
  })
  const dispose = initialize?.({state, instance, key})
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

The smart part is that each store instance is isolated by its binder key. For example, a document store for "project1/production" is separate from a document store for "project1/staging" - they don't interfere with each other and the implementation can remain simple operating on a single resource.

### Action Binding and State Updates

To interact with stores, the SDK uses "action binding" - a pattern where functions are connected (or "bound") to specific store instances. When you call a bound store action, it automatically knows which store instance to use. Importantly, stores are lazily initialized - they aren't created until the first time an action is called. This approach both simplifies state management and optimizes performance by only creating store instances when they're actually needed.

There are three main ways actions are bound to stores:

1. **Global Binding** (`bindActionGlobally`): Creates one shared store instance that all Sanity instances access together, regardless of their `instance.config` - useful for app-wide state like authentication
2. **Resource Binding** (`bindActionByResource`): Creates independent store instances for each dataset, media library, or canvas resource
3. **Resource and Perspective Binding** (`bindActionByResourceAndPerspective`): Further isolates resource state by perspective

Here's a simplified look at how the action binding system works:

```typescript
function createActionBinder(keyFn: (instance: SanityInstance, ...params) => {name: string}) {
  // Track store instances and which Sanity instances use them
  const instanceRegistry = new Map<string, Set<string>>()
  const storeRegistry = new Map<string, StoreInstance<unknown>>()

  return function bindAction(storeDefinition, action) {
    return function boundAction(instance, ...params) {
      // Generate a unique key for this store instance
      const key = keyFn(instance, ...params)
      const compositeKey = `${storeDefinition.name}:${key.name}`

      // Get or create set of instances using this store
      let instances = instanceRegistry.get(compositeKey)
      if (!instances) {
        instances = new Set()
        instanceRegistry.set(compositeKey, instances)
      }

      // Track this instance for cleanup
      if (!instances.has(instance.instanceId)) {
        instances.add(instance.instanceId)

        // Clean up when instance is disposed
        instance.onDispose(() => {
          instances.delete(instance.instanceId)

          // If no instances left, clean up store
          if (instances.size === 0) {
            storeRegistry.get(compositeKey)?.dispose()
            storeRegistry.delete(compositeKey)
            instanceRegistry.delete(compositeKey)
          }
        })
      }

      // Get or create store instance
      let store = storeRegistry.get(compositeKey)
      if (!store) {
        store = createStoreInstance(instance, key, storeDefinition)
        storeRegistry.set(compositeKey, store)
      }

      // Execute action with store context
      return action({instance, state: store.state, key}, ...params)
    }
  }
}

// Create resource-specific stores
const bindActionByResource = createActionBinder((instance, {resource}) =>
  createResourceKey(instance, resource),
)

// Create globally shared stores
const bindActionGlobally = createActionBinder(() => ({name: 'global'}))
```

The action binding system is responsible for:

1. **Store Instance Management**: Creating and tracking store instances based on unique keys
2. **Resource Cleanup**: Ensuring stores are cleaned up when no instances are using them
3. **State Isolation**: Keeping state separate between different resources and perspectives
4. **State Sharing**: Allowing state to be shared across all instances (for global stores)

Behind the scenes, the binding system:

1. Determines which store instance to use based on the Sanity instance
2. Creates a new store instance if one doesn't exist yet
3. Executes the action with the right store state

Here's a simple example:

```typescript
// This action is bound globally - all instances share the same auth state
const getCurrentUser = bindActionGlobally(authStore, ({state}) => state.get().user)

// This action is bound by resource - each resource has its own documents
const getDocuments = bindActionByResource(documentStore, ({state}) => state.get().documents)
```

### v3 Fetcher and Mutation Utilities

For API-style resources, v3 replaced `createFetcherStore` with `defineFetcher` in `packages/core/src/store/fetcherStore.ts`. Fetcher definitions share a globally bound cache while their names and parameter keys keep entries isolated. The cache supports stale-while-revalidate behavior, garbage collection, explicit refetching, and tag-based invalidation.

`defineMutation` uses the same cache for optimistic writes, rollback on failure, reconciliation, and invalidation. See `SDK-Developer-Onboarding.md` for a focused walkthrough of these utilities.

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
  const {data: projects} = useProjects()

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
        <ResourceProvider projectId={selectedProjectId} fallback={fallback}>
          <Datasets key={selectedProjectId} />
        </ResourceProvider>
      )}
    </div>
  )
}

function Datasets() {
  // Track which dataset is selected
  const [selectedDataset, setSelectedDataset] = useState('')

  // Get datasets for the current project
  const {data: datasets} = useDatasets()

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
        <ResourceProvider dataset={selectedDataset} fallback={fallback}>
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
  const {data: documentTypes} = useQuery<string[]>({
    query: 'array::unique(*[]._type)',
  })

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
    filter: `_type == $type`,
    params: {type},
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
   - When selections change, the subtree receives the newly selected resource context
   - Suspense boundaries provide loading states at appropriate levels
   - State is isolated appropriately (project list vs. dataset-specific data)

You can extend this pattern for more complex scenarios too:

```tsx
// Example: Adding an environment toggle
function DatasetExplorer({projectId}: ProjectHandle) {
  const [environment, setEnvironment] = useState('production')

  return (
    <ResourceProvider
      projectId={projectId}
      dataset={environment === 'production' ? 'production' : 'staging'}
      fallback={<div>Loading...</div>}
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
   - SDKProvider should select the default configuration and provide the named resources map
   - ResourceProvider should create the root instance and provide resource context to subtrees

2. **Preserve Config Ordering Semantics**

   - The first configuration in the user-provided array should remain the default configuration
   - Any changes to config handling must maintain this contract

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
   - Use resource binding for data that's specific to a dataset, media library, or canvas
   - Use resource-and-perspective binding when the same resource needs perspective-specific state
   - Clearly document which pattern is used for each store

## Conclusion

The Sanity App SDK's resource management system provides a powerful foundation for building sophisticated applications. By understanding these internal implementation details, you can maintain and extend the SDK effectively while preserving its consistent behavior for end users.

Whether building a simple single-project app or a complex multi-dataset experience, these patterns enable efficient resource management, clean component hierarchies, and maintainable code architecture.
