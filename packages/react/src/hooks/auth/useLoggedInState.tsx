import {getSessionStore, type LoggedInState, type SanityInstance} from '@sanity/sdk'
import {useMemo} from 'react'
import {useStore} from 'zustand'

/**
 * Hook to get the logged in state
 * @public
 * @param sanityInstance - The sanity instance
 * @returns The logged in state
 */
export const useLoggedInState = (sanityInstance: SanityInstance): LoggedInState => {
  const sessionStore = useMemo(() => getSessionStore(sanityInstance), [])

  return useStore(sessionStore, (state) => state.loggedInState)
}
