import type {SanityInstance} from '@sanity/sdk'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

export function createCallbackHook<TParams extends unknown[], TReturn>(
  callback: (instance: SanityInstance, ...params: TParams) => TReturn,
): () => (...params: TParams) => TReturn {
  function useHook() {
    const instance = useSanityInstance()
    return useCallback((...params: TParams) => callback(instance, ...params), [instance])
  }

  return useHook
}
