import {type ClientPerspective} from '@sanity/client'

import {
  type DatasetHandle,
  type DocumentSource,
  isCanvasSource,
  isDatasetSource,
  isMediaLibrarySource,
  type ReleasePerspective,
} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type SanityInstance} from './createSanityInstance'
import {createStoreInstance, type StoreInstance} from './createStoreInstance'
import {type StoreState} from './createStoreState'
import {type StoreContext, type StoreDefinition} from './defineStore'

export interface BoundSourceKey {
  name: string
  source: DocumentSource
}
export interface BoundPerspectiveKey extends BoundSourceKey {
  perspective: ClientPerspective | ReleasePerspective
}
interface BoundDatasetKey {
  name: string
  projectId: string
  dataset: string
}

/**
 * Defines a store action that operates on a specific state type
 */
export type StoreAction<TState, TParams extends unknown[], TReturn, TKey = unknown> = (
  context: StoreContext<TState, TKey>,
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
export function createActionBinder<
  TKey extends {name: string},
  TKeyParams extends unknown[] = unknown[],
>(keyFn: (instance: SanityInstance, ...params: TKeyParams) => TKey) {
  const instanceRegistry = new Map<string, Set<string>>()
  const storeRegistry = new Map<string, StoreInstance<unknown>>()

  /**
   * Binds a store action to a store definition
   *
   * @param storeDefinition - The store definition
   * @param action - The action to bind
   * @returns A function that executes the action with a Sanity instance
   */
  return function bindAction<TState, TParams extends TKeyParams, TReturn>(
    storeDefinition: StoreDefinition<TState, TKey>,
    action: StoreAction<TState, TParams, TReturn, TKey>,
  ): BoundStoreAction<TState, TParams, TReturn> {
    return function boundAction(instance: SanityInstance, ...params: TParams) {
      const key = keyFn(instance, ...params)
      const compositeKey = storeDefinition.name + (key.name ? `:${key.name}` : '')

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
        storeInstance = createStoreInstance(instance, key, storeDefinition)
        storeRegistry.set(compositeKey, storeInstance)
      }

      // Execute action with store context
      return action({instance, state: storeInstance.state as StoreState<TState>, key}, ...params)
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
export const bindActionByDataset = createActionBinder<
  BoundDatasetKey,
  [(object & {projectId?: string; dataset?: string})?, ...unknown[]]
>((instance, options) => {
  const projectId = options?.projectId ?? instance.config.projectId
  const dataset = options?.dataset ?? instance.config.dataset
  if (!projectId || !dataset) {
    throw new Error('This API requires a project ID and dataset configured.')
  }
  return {name: `${projectId}.${dataset}`, projectId, dataset}
})

const createSourceKey = (instance: SanityInstance, source?: DocumentSource): BoundSourceKey => {
  let name: string | undefined
  let sourceForKey: DocumentSource | undefined
  if (source) {
    sourceForKey = source
    if (isDatasetSource(source)) {
      name = `${source.projectId}.${source.dataset}`
    } else if (isMediaLibrarySource(source)) {
      name = `media-library:${source.mediaLibraryId}`
    } else if (isCanvasSource(source)) {
      name = `canvas:${source.canvasId}`
    } else {
      throw new Error(`Received invalid source: ${JSON.stringify(source)}`)
    }
    return {name, source: sourceForKey}
  }

  // TODO: remove reference to instance.config when we get to v3
  const {projectId, dataset} = instance.config
  if (!projectId || !dataset) {
    throw new Error('This API requires a project ID and dataset configured.')
  }
  return {name: `${projectId}.${dataset}`, source: {projectId, dataset}}
}

/**
 * Binds an action to a store that's scoped to a specific document source.
 **/
export const bindActionBySource = createActionBinder<
  BoundSourceKey,
  [{source?: DocumentSource}, ...unknown[]]
>((instance, {source}) => {
  return createSourceKey(instance, source)
})

/**
 * Binds an action to a store that's scoped to a specific document source and perspective.
 *
 * @remarks
 * This creates actions that operate on state isolated to a specific document source and perspective.
 * Different document sources and perspectives will have separate states.
 *
 * This is mostly useful for stores that do batch fetching operations, since the query store
 * can isolate single queries by perspective.
 *
 * @throws Error if source or perspective is missing from the Sanity instance config
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
 * // Create source-and-perspective-specific actions
 * export const fetchDocuments = bindActionBySourceAndPerspective(
 *   documentStore,
 *   ({instance, state}, documentId) => {
 *     // This state is isolated to the specific document source and perspective
 *     // ...fetch logic...
 *   }
 * )
 *
 * // Usage
 * fetchDocument(sanityInstance, 'doc123')
 * ```
 */
export const bindActionBySourceAndPerspective = createActionBinder<
  BoundPerspectiveKey,
  [DatasetHandle, ...unknown[]]
>((instance, options): BoundPerspectiveKey => {
  const {source, perspective} = options
  // TODO: remove reference to instance.config.perspective when we get to v3
  const utilizedPerspective = perspective ?? instance.config.perspective ?? 'drafts'
  let perspectiveKey: string
  if (isReleasePerspective(utilizedPerspective)) {
    perspectiveKey = utilizedPerspective.releaseName
  } else if (typeof utilizedPerspective === 'string') {
    perspectiveKey = utilizedPerspective
  } else {
    // "StackablePerspective", shouldn't be a common case, but just in case
    perspectiveKey = JSON.stringify(utilizedPerspective)
  }
  const sourceKey = createSourceKey(instance, source)

  return {
    name: `${sourceKey.name}:${perspectiveKey}`,
    source: sourceKey.source,
    perspective: utilizedPerspective,
  }
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
export const bindActionGlobally = createActionBinder((..._rest) => ({name: 'global'}))
