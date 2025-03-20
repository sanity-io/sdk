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
