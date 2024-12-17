import {filter, map, Observable, pairwise} from 'rxjs'

import type {ResourceState} from './createResource'

/**
 * @public
 */
export interface StateSource<T> {
  subscribe: (onStoreChanged: () => void) => () => void
  getCurrent: () => T
}

export function createStateSource<T>(
  state: ResourceState<unknown>,
  getValue: () => T,
): StateSource<T> {
  return {
    getCurrent: getValue,
    subscribe: (onStoreChanged) => {
      const subscription = state.observable
        .pipe(
          // TODO: finish this comment
          // this is similar to `distinctUntilChanged` expect that
          map(getValue),
          pairwise(),
          filter(([prev, curr]) => prev !== curr),
          map(([_, curr]) => curr),
        )
        .subscribe({next: onStoreChanged})

      return () => subscription.unsubscribe()
    },
  }
}

export function createObservableFromStateSource<T>(stateSource: StateSource<T>): Observable<T> {
  return new Observable<T>((observer) => {
    observer.next(stateSource.getCurrent())

    return stateSource.subscribe(() => {
      observer.next(stateSource.getCurrent())
    })
  })
}
