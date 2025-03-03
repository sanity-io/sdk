/* eslint-disable @typescript-eslint/no-explicit-any */
import {noop} from 'lodash-es'

import {type SanityInstance} from '../instance/types'
import {type ActionContext, type ResourceAction} from './createAction'
import {initializeResource, type Resource} from './createResource'

/**
 * Creates a bound resource action that can be called with specific parameters
 * and returns a specific type
 * @public
 */
export type BoundResourceAction<TParams extends unknown[], TReturn> = (
  ...params: TParams
) => TReturn

/**
 * Maps a collection of resource actions to their bound versions
 * Bound actions have their context (state and instance) already provided
 */
export type BoundActions<TActions extends {[key: string]: ResourceAction<any, any, any>}> = {
  [K in keyof TActions]: TActions[K] extends ResourceAction<any, infer TParams, infer TReturn>
    ? BoundResourceAction<TParams, TReturn>
    : never
}

type StoreFactory<TActions extends {[key: string]: ResourceAction<any, any, any>}> = (
  instance: SanityInstance | ActionContext<any>,
) => {
  dispose: () => void
} & BoundActions<TActions>

/**
 * Creates a store factory that binds actions to a specific Sanity instance or action context
 * @param resource - The resource definition containing state management logic
 * @param actions - Object containing resource actions to be bound
 * @returns A factory function that creates a store with bound actions and disposal method
 *
 * @example
 * ```ts
 * const myStore = createStore(myResource, {
 *   doSomething: createAction(myResource, ({state}) => () => { ... })
 * })
 * ```
 */
export function createStore<
  TState,
  TActions extends {[key: string]: ResourceAction<any, any, any>},
>(resource: Resource<TState>, actions: TActions): StoreFactory<TActions> {
  return function storeFactory(dependencies: SanityInstance | ActionContext<TState>) {
    const instance = 'instance' in dependencies ? dependencies.instance : dependencies
    const {state, dispose} =
      'state' in dependencies
        ? {state: dependencies.state, dispose: noop}
        : initializeResource(instance, resource)
    const boundActions = Object.entries(actions).reduce<
      Record<string, BoundResourceAction<unknown[], unknown>>
    >((acc, [key, action]) => {
      acc[key] = action.bind(null, {state, instance})
      return acc
    }, {}) as BoundActions<TActions>

    return {dispose, ...boundActions}
  }
}
