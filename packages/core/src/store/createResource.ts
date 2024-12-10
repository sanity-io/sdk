import {Observable} from 'rxjs'
import type {SanityInstance, SdkIdentity} from '../instance/types'
import {createStore} from 'zustand/vanilla'
import {devtools} from 'zustand/middleware'

type Teardown = () => void

export interface Resource<TContext, TState> {
  key: string
  getContext: (params: {instance: SanityInstance}) => TContext
  getInitialState: (params: {instance: SanityInstance; context: TContext}) => TState
  initialize: (params: {instance: SanityInstance; context: TContext}) => Teardown
}

export function createResource<TContext, TState>(
  key: string,
  resource: Omit<Resource<TContext, TState>, 'key'>,
): Resource<TContext, TState> {
  return {key, ...resource}
}

export type ResourceState<TState> = {
  get: () => TState
  set: (name: string, state: Partial<TState>) => void
  observable: Observable<TState>
}

interface InitializedResource<TContext, TState> {
  context: TContext
  state: ResourceState<TState>
  dispose: () => void
}

export type ResourceAction<TContext, TState, TParams extends any[], TReturn> = (options: {
  instance: SanityInstance
  context: TContext
  state: ResourceState<TState>
}) => (...args: TParams) => TReturn

function initializeResource<TContext, TState>(
  instance: SanityInstance,
  resource: Resource<TContext, TState>,
): InitializedResource<TContext, TState> {
  const context = resource.getContext({instance})
  const initialState = resource.getInitialState({instance, context})
  const store = createStore<TState>()(devtools(() => initialState, {name: resource.key}))
  const state: ResourceState<TState> = {
    get: store.getState,
    set: (actionKey, state) => store.setState(state, false, actionKey),
    observable: new Observable((observer) => store.subscribe(observer.next)),
  }
  const dispose = resource.initialize({instance, context})

  return {state, context, dispose}
}

const resourceCache = new WeakMap<SdkIdentity, Map<string, InitializedResource<unknown, unknown>>>()

function getOrCreateResource<TContext, TState>(
  instance: SanityInstance,
  resource: Resource<TContext, TState>,
): InitializedResource<TContext, TState> {
  if (!resourceCache.has(instance.identity)) {
    resourceCache.set(instance.identity, new Map())
  }
  const initializedResources = resourceCache.get(instance.identity)!
  const cached = initializedResources.get(resource.key)
  if (cached) return cached as InitializedResource<TContext, TState>

  const result = initializeResource(instance, resource)
  initializedResources.set(resource.key, result)
  return result
}

export function createResourceAction<TContext, TState, TParams extends any[], TReturn>(
  resource: Resource<TContext, TState>,
  actionDefinition: ResourceAction<TContext, TState, TParams, TReturn>,
) {
  return (instance: SanityInstance, ...args: TParams): TReturn => {
    const {context, state} = getOrCreateResource(instance, resource)
    return actionDefinition({instance, state, context})(...args)
  }
}
