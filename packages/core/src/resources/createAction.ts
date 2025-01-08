import type {SanityInstance} from '../instance/types'
import {getOrCreateResource, type Resource, type ResourceState} from './createResource'

/** @public */
export interface ActionContext<TState> {
  instance: SanityInstance
  state: ResourceState<TState>
}

type ResourceActionDefinition<TState, TParams extends unknown[], TReturn> = (options: {
  instance: SanityInstance
  state: ResourceState<TState>
}) => (this: ActionContext<TState>, ...args: TParams) => TReturn

/**
 * @public
 */
export type ResourceAction<TState, TParams extends unknown[], TReturn> = (
  dependencies: SanityInstance | ActionContext<TState>,
  ...params: TParams
) => TReturn

export function createAction<TState, TParams extends unknown[], TReturn>(
  getResource: () => Resource<TState>,
  actionDefinition: ResourceActionDefinition<TState, TParams, TReturn>,
): ResourceAction<TState, TParams, TReturn> {
  return (dependencies: SanityInstance | ActionContext<TState>, ...args: TParams): TReturn => {
    const instance = 'state' in dependencies ? dependencies.instance : dependencies
    const {state} =
      'state' in dependencies ? dependencies : getOrCreateResource(dependencies, getResource())
    const actionContext = {instance, state}
    return actionDefinition(actionContext).bind(actionContext)(...args)
  }
}

/**
 * @internal
 */
export function createInternalAction<TState, TParams extends unknown[], TReturn>(
  actionDefinition: ResourceActionDefinition<TState, TParams, TReturn>,
) {
  return (actionContext: ActionContext<TState>, ...args: TParams): TReturn => {
    return actionDefinition(actionContext).bind(actionContext)(...args)
  }
}
