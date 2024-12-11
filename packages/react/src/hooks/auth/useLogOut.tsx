import {type AuthStore, getAuthStore} from '@sanity/sdk'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Hook to log out of the current session
 * @public
 * @returns A function to log out of the current session
 */
export const useLogOut = (): AuthStore['logout'] => {
  const instance = useSanityInstance()
  const {logout} = getAuthStore(instance)

  return logout
}
