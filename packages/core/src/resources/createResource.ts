import {Observable} from 'rxjs'
import {devtools, type DevtoolsOptions} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

import {type SanityInstance, type SdkIdentity} from '../instance/types'
import {getEnv} from '../utils/getEnv'

const resourceCache = new WeakMap<SdkIdentity, Map<string, InitializedResource<unknown>>>()

// Create a singleton identity for the shared auth store
const SHARED_IDENTITY: SdkIdentity = {
  id: 'shared',
  resourceId: 'shared.shared',
  projectId: 'shared',
  dataset: 'shared',
} as const

type Teardown = () => void

export interface Resource<TState> {
  name: string
  getInitialState(instance: SanityInstance): TState
  initialize?: (
    this: {instance: SanityInstance; state: ResourceState<TState>},
    instance: SanityInstance,
  ) => Teardown
  isShared?: boolean
}

export function createResource<TState>(resource: Resource<TState>): Resource<TState> {
  return resource
}

/**
 * @public
 */
export type ResourceState<TState> = {
  get: () => TState
  set: (name: string, state: Partial<TState> | ((s: TState) => Partial<TState>)) => void
  observable: Observable<TState>
}

export interface InitializedResource<TState> {
  state: ResourceState<TState>
  dispose: () => void
}

export function createResourceState<TState>(
  initialState: TState,
  devToolsOptions?: DevtoolsOptions,
): ResourceState<TState> {
  const store = createStore<TState>()(devtools(() => initialState, devToolsOptions))
  return {
    get: store.getState,
    set: (actionKey, updatedState) => {
      // avoids unnecessary updates if the state remains unchanged. since we
      // use immutable data, this is safe and aligns with React's approach
      if (store.getState() !== updatedState) {
        store.setState(updatedState, false, actionKey)
      }
    },
    observable: new Observable((observer) => {
      const emit = () => observer.next(store.getState())
      emit()
      return store.subscribe(emit)
    }),
  }
}

export function initializeResource<TState>(
  instance: SanityInstance,
  resource: Resource<TState>,
): InitializedResource<TState> {
  const fullName = resource.isShared
    ? `${resource.name}-shared`
    : `${resource.name}-${instance.identity.resourceId}`
  const initialState = resource.getInitialState(instance)
  const state = createResourceState(initialState, {
    name: fullName,
    enabled: !!getEnv('DEV'),
  })
  const dispose = resource.initialize?.call({instance, state}, instance) ?? (() => {})

  return {state, dispose}
}

// Track which instances are using which shared resources
const instanceSharedResources = new Map<SdkIdentity, Set<string>>()

export function getOrCreateResource<TState>(
  instance: SanityInstance,
  resource: Resource<TState>,
): InitializedResource<TState> {
  const identityKey = resource.isShared ? SHARED_IDENTITY : instance.identity
  const fullName = resource.isShared
    ? `${resource.name}-shared`
    : `${resource.name}-${instance.identity.resourceId}`

  if (resource.isShared) {
    // Track that this instance is using this shared resource
    if (!instanceSharedResources.has(instance.identity)) {
      instanceSharedResources.set(instance.identity, new Set())
    }
    instanceSharedResources.get(instance.identity)!.add(fullName)
  }

  if (!resourceCache.has(identityKey)) {
    resourceCache.set(identityKey, new Map())
  }
  const initializedResources = resourceCache.get(identityKey)!
  const cached = initializedResources.get(fullName)
  if (cached) return cached as InitializedResource<TState>

  const result = initializeResource(instance, resource)
  initializedResources.set(fullName, result)
  return result
}

export function disposeResources(identity: SdkIdentity): void {
  // Handle instance-specific resources (not shared)
  const resources = resourceCache.get(identity)
  if (resources) {
    for (const resource of resources.values()) {
      resource.dispose()
    }
    resourceCache.delete(identity)
  }

  // Handle shared resources this instance may have been using
  const usedSharedResources = instanceSharedResources.get(identity)
  if (usedSharedResources) {
    const sharedResources = resourceCache.get(SHARED_IDENTITY)
    if (sharedResources) {
      for (const fullName of usedSharedResources) {
        const resource = sharedResources.get(fullName)
        if (resource) {
          // Remove this instance from tracking
          usedSharedResources.delete(fullName)

          // Check if any other instances are still using this shared resource
          let stillInUse = false
          for (const [otherIdentity, otherUsed] of instanceSharedResources.entries()) {
            if (otherIdentity !== identity && otherUsed.has(fullName)) {
              stillInUse = true
              break
            }
          }

          // If no other instances are using it, dispose and clean up
          if (!stillInUse) {
            resource.dispose()
            sharedResources.delete(fullName)
          }
        }
      }

      // Clean up shared resources map if empty
      if (sharedResources.size === 0) {
        resourceCache.delete(SHARED_IDENTITY)
      }
    }

    // Clean up instance tracking
    instanceSharedResources.delete(identity)
  }
}
