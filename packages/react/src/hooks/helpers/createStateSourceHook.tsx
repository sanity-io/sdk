import type {SanityInstance, StateSource} from '@sanity/sdk'
import {useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

export function createStateSourceHook<TParams extends unknown[], TState>(
  stateSourceFactory: (instance: SanityInstance, ...params: TParams) => StateSource<TState>,
): (...params: TParams) => TState {
  function useHook(...params: TParams) {
    const instance = useSanityInstance()
    const {subscribe, getCurrent} = useMemo(
      () => stateSourceFactory(instance, ...params),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [instance, ...params],
    )

    return useSyncExternalStore(subscribe, getCurrent)
  }

  return useHook
}
