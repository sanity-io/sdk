import {type AuthProvider, getAuthProviders} from '@sanity/sdk'
import {useMemo} from 'react'

/**
 * A hook that returns the login links for Sanity
 * @public
 */
export const useLoginLinks = (): AuthProvider[] => {
  const authProviders = useMemo(
    () => getAuthProviders(window.location.href),
    [window.location.href],
  )
  return authProviders
}

export type {AuthProvider}
