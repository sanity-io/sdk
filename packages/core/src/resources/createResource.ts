import {Observable} from 'rxjs'
import {devtools, type DevtoolsOptions} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

import {type SanityInstance, type SdkResource} from '../instance/types'
import {getEnv} from '../utils/getEnv'

const resourceCache = new WeakMap<
  readonly SdkResource[],
  Map<string, InitializedResource<unknown>>
>()

type Teardown = () => void

/**
 * Defines the structure of a resource, which manages state and initialization
 * for a specific feature or domain
 */
export interface Resource<TState> {
  /** Unique identifier for the resource */
  name: string
  /** Function to create the initial state for this resource */
  getInitialState(instance: SanityInstance): TState
  /** Optional initialization function that can set up subscriptions or side effects */
  initialize?: (
    this: {instance: SanityInstance; state: ResourceState<TState>},
    instance: SanityInstance,
  ) => Teardown
}

export function createResource<TState>(resource: Resource<TState>): Resource<TState> {
  return resource
}

/**
 * @public
 * State management utilities for a resource
 */
export type ResourceState<TState> = {
  /** Get the current state */
  get: () => TState
  /** Update the state with a partial update or update function */
  set: (name: string, state: Partial<TState> | ((s: TState) => Partial<TState>)) => void
  /** Observable stream of state changes */
  observable: Observable<TState>
}

export interface InitializedResource<TState> {
  state: ResourceState<TState>
  dispose: () => void
}

/**
 * Creates a resource state manager with the provided initial state
 * Includes devtools integration when in development mode
 */
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
  const initialState = resource.getInitialState(instance)
  const state = createResourceState(initialState, {
    name: resource.name,
    enabled: !!getEnv('DEV'),
  })
  const dispose = resource.initialize?.call({instance, state}, instance) ?? (() => {})

  return {state, dispose}
}

export function getOrCreateResource<TState>(
  instance: SanityInstance,
  resource: Resource<TState>,
): InitializedResource<TState> {
  // Validate that the resource has a name property
  if (!resource.name) {
    throw new Error('Resource is not defined')
  }

  // Initialize the cache for this instance's resources if it doesn't exist
  if (!resourceCache.has(instance.resources)) {
    resourceCache.set(instance.resources, new Map())
  }

  // Get the cache map for this instance's resources
  const initializedResources = resourceCache.get(instance.resources)!

  // Return cached resource if it exists to prevent duplicate initialization
  const cached = initializedResources.get(resource.name)
  if (cached) return cached as InitializedResource<TState>

  // Initialize new resource and cache it for future use
  const result = initializeResource(instance, resource)
  initializedResources.set(resource.name, result)
  return result
}

export function disposeResources(resources: SdkResource[]): void {
  const resourcesMap = resourceCache.get(resources)
  if (!resourcesMap) return

  for (const resource of resourcesMap.values()) {
    resource.dispose()
  }
}
