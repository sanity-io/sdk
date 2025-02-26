import {distinctUntilChanged, map, Observable, share, skip} from 'rxjs'

import {type ActionContext, createAction, type ResourceAction} from './createAction'
import {type Resource} from './createResource'

/**
 * @public
 */
export interface StateSource<T> {
  subscribe: (onStoreChanged?: () => void) => () => void
  getCurrent: () => T
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
        const cleanup = subscribeHandler?.(this, ...args)

        const subscription = state.observable
          .pipe(
            map(getCurrent),
            distinctUntilChanged(isEqual),
            // skip the first emission because we only want to emit when the
            // value changes. `distinctUntilChanged` will always emit the first
            // the first value so we skip this emission
            skip(1),
          )
          .subscribe({
            next: () => onStoreChanged?.(),
            // the convention is to have the selector throw the error so we
            // invoke onStoreChanged on error as well. this will cause the
            // observable code path below to emit an error because the selector
            // will throw and that will be used to emit an .error on the observer
            error: () => onStoreChanged?.(),
          })

        return () => {
          subscription.unsubscribe()
          cleanup?.()
        }
      }

      const observable = new Observable<TReturn>((observer) => {
        const emitCurrent = () => {
          try {
            observer.next(getCurrent())
          } catch (error) {
            observer.error(error)
          }
        }
        emitCurrent()
        return subscribe(emitCurrent)
      }).pipe(share())

      return {
        getCurrent,
        subscribe,
        observable,
      }
    }
  })
}
