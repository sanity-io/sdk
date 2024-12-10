import {createStore, type StoreApi} from 'zustand/vanilla'

import type {SanityInstance} from '../instance/types'
import {getInternalAuthStore} from './getInternalAuthStore'

export const createTestStore = (
  instance: SanityInstance,
): StoreApi<{
  internalGetExample: string
  internalSetExample: () => void
}> => {
  const internalStore = getInternalAuthStore(instance)
  return createStore<{
    internalGetExample: string
    internalSetExample: () => void
  }>()((_set, _get) => ({
    internalGetExample: internalStore.getState().getTopSecretInfo(),
    internalSetExample: () => {
      internalStore.getState().setProviders([])
    },
  }))
}
