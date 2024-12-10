import {getAuthStore} from '@sanity/sdk'
import {useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Hook to get the currently logged in user
 * @public
 * @returns The current user or null if not authenticated
 */
export const useAuthToken = (): string | null => {
  const instance = useSanityInstance()
  const {tokenState} = getAuthStore(instance)

  tokenState.subscribe((token, prevToken) => {
    console.log('useAuthToken token', token)
    console.log('useAuthToken prevToken', prevToken)
  })

  // instead of using useStore we will use useSyncExternalStore
  const token = useSyncExternalStore(
    tokenState.subscribe,
    () => tokenState.getState(),
    () => null,
  )
  return token
}
