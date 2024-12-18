/* eslint-disable @typescript-eslint/no-explicit-any */
import type {SanityInstance} from '../instance/types'
import type {ResourceAction} from './createAction'
import {initializeResource, type Resource} from './createResource'

export type BoundResourceAction<TParams extends unknown[], TReturn> = (
  ...params: TParams
) => TReturn

type BoundActions<TActions extends {[key: string]: ResourceAction<any, any, any>}> = {
  [K in keyof TActions]: TActions[K] extends ResourceAction<any, infer TParams, infer TReturn>
    ? BoundResourceAction<TParams, TReturn>
    : never
}

type StoreFactory<TActions extends {[key: string]: ResourceAction<any, any, any>}> = (
  instance: SanityInstance,
) => {
  dispose: () => void
} & BoundActions<TActions>

export function createStore<
  TState,
  TActions extends {[key: string]: ResourceAction<any, any, any>},
>(resource: Resource<TState>, actions: TActions): StoreFactory<TActions> {
  return function storeFactory(instance: SanityInstance) {
    const {state, dispose} = initializeResource(instance, resource)
    const boundActions = Object.entries(actions).reduce<
      Record<string, BoundResourceAction<unknown[], unknown>>
    >((acc, [key, action]) => {
      acc[key] = action.bind(null, {state, instance})
      return acc
    }, {}) as BoundActions<TActions>

    return {dispose, ...boundActions}
  }
}
