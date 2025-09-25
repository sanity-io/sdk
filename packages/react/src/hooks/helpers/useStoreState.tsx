import {type StateSource} from '@sanity/sdk'
import {useSyncExternalStore} from 'react'
import {first, firstValueFrom} from 'rxjs'

/**
 * useStoreState is a hook around a StateSource which is initially undefined and then
 * eventually always defined.
 */
export function useStoreState<T>(state: StateSource<T | undefined>): T {
  const current = state.getCurrent()

  if (current === undefined) {
    throw firstValueFrom(state.observable.pipe(first((i) => i !== undefined)))
  }

  return useSyncExternalStore(state.subscribe, state.getCurrent as () => T)
}
