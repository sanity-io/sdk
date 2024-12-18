import {getAuthStore} from '@sanity/sdk'
import {useStore} from 'zustand'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Hook to get the currently logged in user
 * @public
 * @returns The current user or null if not authenticated
 */
export const useAuthToken = (): string | null => {
  const instance = useSanityInstance()
  const {tokenState} = getAuthStore(instance)

  return useStore(tokenState)
}
