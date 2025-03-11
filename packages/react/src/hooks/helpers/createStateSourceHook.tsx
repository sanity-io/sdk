import {type ResourceId, type SanityInstance, type StateSource} from '@sanity/sdk'
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
  getResourceId?: (...params: TParams) => ResourceId | undefined
}

export function createStateSourceHook<TParams extends unknown[], TState>(
  options: StateSourceFactory<TParams, TState> | CreateStateSourceHookOptions<TParams, TState>,
): (...params: TParams) => TState {
  const getState = typeof options === 'function' ? options : options.getState
  const getResourceId = 'getResourceId' in options ? options.getResourceId : undefined
  const suspense = 'shouldSuspend' in options && 'suspender' in options ? options : undefined

  function useHook(...params: TParams) {
    let resourceId: ResourceId | undefined
    if (getResourceId) {
      resourceId = getResourceId(...params)
    }
    const instance = useSanityInstance(resourceId)
    if (suspense?.suspender && suspense?.shouldSuspend?.(instance, ...params)) {
      throw suspense.suspender(instance, ...params)
    }

    const state = getState(instance, ...params)
    return useSyncExternalStore(state.subscribe, state.getCurrent)
  }

  return useHook
}
