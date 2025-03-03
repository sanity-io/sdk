import {filter, map, Observable, pairwise} from 'rxjs'

import {type ActionContext, createAction, type ResourceAction} from './createAction'
import {type Resource} from './createResource'

/**
 * Represents a source of state that can be subscribed to and observed
 * @public
 */
export interface StateSource<T> {
  /** Subscribe to state changes */
  subscribe: (onStoreChanged?: () => void) => () => void
  /** Get the current state value */
  getCurrent: () => T
  /** Observable stream of state changes */
  observable: Observable<T>
}

type Selector<TState, TParams extends unknown[], TReturn> = (
  state: TState,
  ...params: TParams
) => TReturn
interface StateSourceOptions<TState, TParams extends unknown[], TReturn> {
  selector: Selector<TState, TParams, TReturn>
  onSubscribe?: (context: ActionContext<TState>, ...params: TParams) => void | (() => void)
  isEqual?: (prev: TReturn, curr: TReturn) => boolean
}

/**
 * Creates an action that provides a state source with selection and subscription capabilities
 * @param resource - The resource this state source is associated with
 * @param options - Either a selector function or an options object with selector and handlers
 * @returns An action that creates a state source when called
 *
 * @example
 * ```ts
 * const getUsers = createStateSourceAction(
 *   userResource,
 *   {
 *     selector: (state, filter: string) => state.users.filter(u => u.name.includes(filter)),
 *     onSubscribe: (context, filter) => {
 *       // Setup subscription
 *       return () => { // Cleanup }
 *     }
 *   }
 * )
 * ```
 */
export function createStateSourceAction<TState, TParams extends unknown[], TReturn>(
  resource: Resource<TState>,
  options: Selector<TState, TParams, TReturn> | StateSourceOptions<TState, TParams, TReturn>,
): ResourceAction<TState, TParams, StateSource<TReturn>> {
  const selector = typeof options === 'function' ? options : options.selector
  const subscribeHandler = options && 'onSubscribe' in options ? options.onSubscribe : undefined
  const isEqual = options && 'isEqual' in options ? (options.isEqual ?? Object.is) : Object.is

  return createAction(resource, ({state}) => {
    return function (...args: TParams): StateSource<TReturn> {
      const getCurrent = () => selector(state.get(), ...args)

      const subscribe = (onStoreChanged?: () => void) => {
        const subscription = state.observable
          .pipe(
            // this is similar to `distinctUntilChanged` expect that it doesn't
            // emit until the first change from `getCurrent`
            map(getCurrent),
            pairwise(),
            filter(([prev, curr]) => !isEqual(prev, curr)),
            map(([_, curr]) => curr),
          )
          .subscribe({next: onStoreChanged})

        const cleanup = subscribeHandler?.(this, ...args)

        return () => {
          subscription.unsubscribe()
          cleanup?.()
        }
      }

      const observable = new Observable<TReturn>((observer) => {
        const emitCurrent = () => observer.next(getCurrent())
        emitCurrent()
        return subscribe(emitCurrent)
      })

      return {
        getCurrent,
        subscribe,
        observable,
      }
    }
  })
}
