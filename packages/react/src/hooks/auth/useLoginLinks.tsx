import {getAuthProviders, type AuthProvider} from '@sanity/sdk'
import {useMemo} from 'react'

/**
 * A hook that returns the login links for Sanity
 * @public
 */
export function useLoginLinks(projectId: string): AuthProvider[] {
  const authProviders = useMemo(
    () => getAuthProviders(window.location.href, projectId),
    [window.location.href, projectId],
  )
  return authProviders
}

export type {AuthProvider}
