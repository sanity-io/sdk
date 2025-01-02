import {filter, map, Observable, pairwise} from 'rxjs'

import {createAction, type ResourceAction} from './createAction'
import type {Resource} from './createResource'

/**
 * @public
 */
export interface StateSource<T> {
  subscribe: (onStoreChanged: () => void) => () => void
  getCurrent: () => T
  observable: Observable<T>
}

export function createStateSourceAction<TState, TParams extends unknown[], TReturn>(
  getResource: () => Resource<TState>,
  selector: (state: TState, ...params: TParams) => TReturn,
): ResourceAction<TState, TParams, StateSource<TReturn>> {
  return createAction(getResource, ({state}) => {
    return function (...args: TParams): StateSource<TReturn> {
      const getCurrent = () => selector(state.get(), ...args)

      const subscribe = (onStoreChanged: () => void) => {
        const subscription = state.observable
          .pipe(
            // this is similar to `distinctUntilChanged` expect that it doesn't
            // emit until the first change from `getCurrent`
            map(getCurrent),
            pairwise(),
            filter(([prev, curr]) => prev !== curr),
            map(([_, curr]) => curr),
          )
          .subscribe({next: onStoreChanged})

        return () => subscription.unsubscribe()
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
