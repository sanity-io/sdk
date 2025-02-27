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

export interface Resource<TState> {
  name: string
  getInitialState(instance: SanityInstance): TState
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
  if (!resource.name) {
    throw new Error('Resource is not defined')
  }

  if (!resourceCache.has(instance.resources)) {
    resourceCache.set(instance.resources, new Map())
  }
  const initializedResources = resourceCache.get(instance.resources)!
  const cached = initializedResources.get(resource.name)
  if (cached) return cached as InitializedResource<TState>

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
