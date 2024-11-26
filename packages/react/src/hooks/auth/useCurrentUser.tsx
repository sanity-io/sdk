import {getSessionStore, type CurrentUser, type SanityInstance} from '@sanity/sdk'
import {useMemo} from 'react'
import {useStore} from 'zustand'

/**
 * Hook to get the currently logged in user
 * @public
 * @param sanityInstance - The sanity instance
 * @returns The current user or null if not authenticated
 */
export const useCurrentUser = (sanityInstance: SanityInstance): CurrentUser | null => {
  const sessionStore = useMemo(() => getSessionStore(sanityInstance), [])

  return useStore(sessionStore, (state) => state.user)
}
