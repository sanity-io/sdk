import {type SanityConfig, type SanityInstance, type StateSource} from '@sanity/sdk'
import {useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

type StateSourceFactory<TParams extends unknown[], TState> = (
  instance: SanityInstance,
  ...params: TParams
) => StateSource<TState>

interface CreateStateSourceHookOptions<TParams extends unknown[], TState> {
  getState: StateSourceFactory<TParams, TState>
  shouldSuspend?: (instance: SanityInstance, ...params: TParams) => boolean
  suspender?: (instance: SanityInstance, ...params: TParams) => Promise<unknown>
  getConfig?: (...params: TParams) => SanityConfig | undefined
}

export function createStateSourceHook<TParams extends unknown[], TState>(
  options: StateSourceFactory<TParams, TState> | CreateStateSourceHookOptions<TParams, TState>,
): (...params: TParams) => TState {
  const getState = typeof options === 'function' ? options : options.getState
  const getConfig = 'getConfig' in options ? options.getConfig : undefined
  const suspense = 'shouldSuspend' in options && 'suspender' in options ? options : undefined

  function useHook(...params: TParams) {
    const instance = useSanityInstance(getConfig?.(...params))

    if (suspense?.suspender && suspense?.shouldSuspend?.(instance, ...params)) {
      throw suspense.suspender(instance, ...params)
    }

    const state = getState(instance, ...params)
    return useSyncExternalStore(state.subscribe, state.getCurrent)
  }

  return useHook
}
