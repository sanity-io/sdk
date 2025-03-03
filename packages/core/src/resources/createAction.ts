import {type SanityInstance} from '../instance/types'
import {getOrCreateResource, type Resource, type ResourceState} from './createResource'

/**
 * Context provided to resource actions, containing the Sanity instance
 * and state management utilities
 * @public
 */
export interface ActionContext<TState> {
  instance: SanityInstance
  state: ResourceState<TState>
}

/**
 * Function that defines how an action should behave given its context
 * Returns a function that will be called with the actual action parameters
 */
type ResourceActionDefinition<TState, TParams extends unknown[], TReturn> = (
  options: ActionContext<TState>,
) => (this: ActionContext<TState>, ...args: TParams) => TReturn

/**
 * @public
 * The final shape of a resource action that can be called with either
 * a Sanity instance or an action context, plus any additional parameters
 */
export type ResourceAction<TState, TParams extends unknown[], TReturn> = (
  dependencies: SanityInstance | ActionContext<TState>,
  ...params: TParams
) => TReturn

/**
 * Creates a resource action that can be used in a store
 * @param resource - The resource this action is associated with
 * @param actionDefinition - Function defining the action's behavior
 * @returns A resource action that can be called with dependencies and parameters
 *
 * @example
 * ```ts
 * const myAction = createAction(myResource, ({state}) =>
 *   (param1: string, param2: number) => {
 *     // Action implementation
 *   }
 * )
 * ```
 */
export function createAction<TState, TParams extends unknown[], TReturn>(
  resource: Resource<TState>,
  actionDefinition: ResourceActionDefinition<TState, TParams, TReturn>,
): ResourceAction<TState, TParams, TReturn> {
  return (dependencies: SanityInstance | ActionContext<TState>, ...args: TParams): TReturn => {
    const instance = 'state' in dependencies ? dependencies.instance : dependencies
    const {state} =
      'state' in dependencies ? dependencies : getOrCreateResource(dependencies, resource)
    const actionContext = {instance, state}
    return actionDefinition(actionContext).bind(actionContext)(...args)
  }
}

/**
 * Creates an internal action that expects to receive an ActionContext directly
 * Used for internal SDK operations where the context is already available
 * @internal
 */
export function createInternalAction<TState, TParams extends unknown[], TReturn>(
  actionDefinition: ResourceActionDefinition<TState, TParams, TReturn>,
) {
  return (actionContext: ActionContext<TState>, ...args: TParams): TReturn => {
    return actionDefinition(actionContext).bind(actionContext)(...args)
  }
}
