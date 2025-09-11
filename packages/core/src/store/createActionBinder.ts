import {type SanityConfig} from '../config/sanityConfig'
import {type SanityInstance} from './createSanityInstance'
import {createStoreInstance, type StoreInstance} from './createStoreInstance'
import {type StoreState} from './createStoreState'
import {type StoreContext, type StoreDefinition} from './defineStore'

/**
 * Defines a store action that operates on a specific state type
 */
export type StoreAction<TState, TParams extends unknown[], TReturn> = (
  context: StoreContext<TState>,
  ...params: TParams
) => TReturn

/**
 * Represents a store action that has been bound to a specific store instance
 */
export type BoundStoreAction<_TState, TParams extends unknown[], TReturn> = (
  instance: SanityInstance,
  ...params: TParams
) => TReturn

/**
 * Creates an action binder function that uses the provided key function
 * to determine how store instances are shared between Sanity instances
 *
 * @param keyFn - Function that generates a key from a Sanity config
 * @returns A function that binds store actions to Sanity instances
 *
 * @remarks
 * Action binders determine how store instances are shared across multiple
 * Sanity instances. The key function determines which instances share state.
 *
 * @example
 * ```ts
 * // Create a custom binder that uses a tenant ID for isolation
 * const bindActionByTenant = createActionBinder(config => config.tenantId || 'default')
 *
 * // Use the custom binder with a store definition
 * const getTenantUsers = bindActionByTenant(
 *   userStore,
 *   ({state}) => state.get().users
 * )
 * ```
 */
export function createActionBinder(keyFn: (config: SanityConfig) => string) {
  const instanceRegistry = new Map<string, Set<string>>()
  const storeRegistry = new Map<string, StoreInstance<unknown>>()

  /**
   * Binds a store action to a store definition
   *
   * @param storeDefinition - The store definition
   * @param action - The action to bind
   * @returns A function that executes the action with a Sanity instance
   */
  return function bindAction<TState, TParams extends unknown[], TReturn>(
    storeDefinition: StoreDefinition<TState>,
    action: StoreAction<TState, TParams, TReturn>,
  ): BoundStoreAction<TState, TParams, TReturn> {
    return function boundAction(instance: SanityInstance, ...params: TParams) {
      const keySuffix = keyFn(instance.config)
      const compositeKey = storeDefinition.name + (keySuffix ? `:${keySuffix}` : '')

      // Get or create instance set for this composite key
      let instances = instanceRegistry.get(compositeKey)
      if (!instances) {
        instances = new Set<string>()
        instanceRegistry.set(compositeKey, instances)
      }

      // Register instance for disposal tracking
      if (!instances.has(instance.instanceId)) {
        instances.add(instance.instanceId)
        instance.onDispose(() => {
          instances.delete(instance.instanceId)

          // Clean up when last instance is disposed
          if (instances.size === 0) {
            storeRegistry.get(compositeKey)?.dispose()
            storeRegistry.delete(compositeKey)
            instanceRegistry.delete(compositeKey)
          }
        })
      }

      // Get or create store instance
      let storeInstance = storeRegistry.get(compositeKey)
      if (!storeInstance) {
        storeInstance = createStoreInstance(instance, storeDefinition)
        storeRegistry.set(compositeKey, storeInstance)
      }

      // Execute action with store context
      return action({instance, state: storeInstance.state as StoreState<TState>}, ...params)
    }
  }
}

/**
 * Binds an action to a store that's scoped to a specific project and dataset
 *
 * @remarks
 * This creates actions that operate on state isolated to a specific projectId and dataset.
 * Different project/dataset combinations will have separate states.
 *
 * @throws Error if projectId or dataset is missing from the Sanity instance config
 *
 * @example
 * ```ts
 * // Define a store
 * const documentStore = defineStore<DocumentState>({
 *   name: 'Document',
 *   getInitialState: () => ({ documents: {} }),
 *   // ...
 * })
 *
 * // Create dataset-specific actions
 * export const fetchDocument = bindActionByDataset(
 *   documentStore,
 *   ({instance, state}, documentId) => {
 *     // This state is isolated to the specific project/dataset
 *     // ...fetch logic...
 *   }
 * )
 *
 * // Usage
 * fetchDocument(sanityInstance, 'doc123')
 * ```
 */
export const bindActionByDataset = createActionBinder(({projectId, dataset}) => {
  if (!projectId || !dataset) {
    throw new Error('This API requires a project ID and dataset configured.')
  }
  return `${projectId}.${dataset}`
})

/**
 * @public
 * Binds an action to a store that's scoped to a specific media library
 *
 * @remarks
 * This creates actions that operate on state isolated to a specific media library.
 * Different media libraries will have separate states.
 *
 * @throws Error if mediaLibraryId is missing from the Sanity instance config
 *
 * @example
 * ```ts
 * // Define a store
 * const mediaStore = defineStore<MediaState>({
 *   name: 'Media',
 *   getInitialState: () => ({ assets: {} }),
 *   // ...
 * })
 *
 * // Create media library-specific actions
 * export const fetchAsset = bindActionByMediaLibrary(
 *   mediaStore,
 *   ({instance, state}, assetId) => {
 *     // This state is isolated to the specific media library
 *     // ...fetch logic...
 *   }
 * )
 *
 * // Usage
 * fetchAsset(sanityInstance, 'asset123')
 * ```
 */
export const bindActionByMediaLibrary = createActionBinder(({mediaLibraryId}) => {
  if (!mediaLibraryId) {
    throw new Error('This API requires a media library ID configured.')
  }
  return `media-library:${mediaLibraryId}`
})

/**
 * @public
 * Binds an action to a store that's scoped to either a dataset or media library
 *
 * @remarks
 * This creates actions that can operate on state isolated to either a specific project/dataset
 * combination or a specific media library, depending on the configuration provided.
 * Different resource types will have separate states.
 *
 * @throws Error if neither projectId/dataset nor mediaLibraryId is provided
 *
 * @example
 * ```ts
 * // Define a store
 * const queryStore = defineStore<QueryState>({
 *   name: 'Query',
 *   getInitialState: () => ({ queries: {} }),
 *   // ...
 * })
 *
 * // Create universal actions that work with both datasets and media libraries
 * export const executeQuery = bindActionByResource(
 *   queryStore,
 *   ({instance, state}, queryOptions) => {
 *     // This state is isolated to the specific resource (dataset or media library)
 *     // ...query logic...
 *   }
 * )
 *
 * // Usage with dataset
 * executeQuery(datasetInstance, { projectId: 'proj', dataset: 'ds', query: '*' })
 *
 * // Usage with media library
 * executeQuery(mediaLibraryInstance, { mediaLibraryId: 'lib', query: '*' })
 * ```
 */
export const bindActionByResource = createActionBinder((config) => {
  if (config.mediaLibraryId && !config.projectId && !config.dataset) {
    return `media-library:${config.mediaLibraryId}`
  }
  if (config.projectId && config.dataset) {
    return `${config.projectId}.${config.dataset}`
  }
  throw new Error(
    'This API requires either a project ID and dataset, or a media library ID configured.',
  )
})

/**
 * Binds an action to a global store that's shared across all Sanity instances
 *
 * @remarks
 * This creates actions that operate on state shared globally across all Sanity instances.
 * Use this for features like authentication where the state should be the same
 * regardless of which project or dataset is being used.
 *
 * @example
 * ```ts
 * // Define a store
 * const authStore = defineStore<AuthState>({
 *   name: 'Auth',
 *   getInitialState: () => ({
 *     user: null,
 *     isAuthenticated: false
 *   }),
 *   // ...
 * })
 *
 * // Create global actions
 * export const getCurrentUser = bindActionGlobally(
 *   authStore,
 *   ({state}) => state.get().user
 * )
 *
 * export const login = bindActionGlobally(
 *   authStore,
 *   ({state, instance}, credentials) => {
 *     // Login logic that affects global state
 *     // ...
 *   }
 * )
 *
 * // Usage with any instance
 * getCurrentUser(sanityInstance)
 * ```
 */
export const bindActionGlobally = createActionBinder(() => 'global')
