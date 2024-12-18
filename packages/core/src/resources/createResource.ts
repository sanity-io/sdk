import {Observable} from 'rxjs'
import {devtools, type DevtoolsOptions} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

import type {SanityInstance, SdkIdentity} from '../instance/types'

const resourceCache = new WeakMap<SdkIdentity, Map<string, InitializedResource<unknown>>>()

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
    set: (actionKey, updatedState) => store.setState(updatedState, false, actionKey),
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
    enabled: import.meta.env.DEV,
  })
  const dispose = resource.initialize?.call({instance, state}, instance) ?? (() => {})

  return {state, dispose}
}

export function getOrCreateResource<TState>(
  instance: SanityInstance,
  resource: Resource<TState>,
): InitializedResource<TState> {
  if (!resourceCache.has(instance.identity)) {
    resourceCache.set(instance.identity, new Map())
  }
  const initializedResources = resourceCache.get(instance.identity)!
  const cached = initializedResources.get(resource.name)
  if (cached) return cached as InitializedResource<TState>

  const result = initializeResource(instance, resource)
  initializedResources.set(resource.name, result)
  return result
}

export function disposeResources(identity: SdkIdentity): void {
  const resources = resourceCache.get(identity)
  if (!resources) return

  for (const resource of resources.values()) {
    resource.dispose()
  }
}
