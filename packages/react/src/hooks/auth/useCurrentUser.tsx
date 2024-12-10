import {type CurrentUser, type CurrentUserSlice, getAuthStore} from '@sanity/sdk'
import {useStore} from 'zustand'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Hook to get the currently logged in user
 * @public
 * @returns The current user or null if not authenticated
 */
export const useCurrentUser = (): CurrentUser | null => {
  const instance = useSanityInstance()
  const {currentUserState} = getAuthStore(instance)

  return useStore<CurrentUserSlice>(currentUserState)
}
