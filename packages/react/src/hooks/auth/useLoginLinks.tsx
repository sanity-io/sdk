import {type AuthProvider, getAuthProviders} from '@sanity/sdk'
import {useMemo} from 'react'

/**
 * React hook that provides authentication provider links for Sanity login
 *
 * @public
 *
 * @returns Array of authentication providers with configured login URLs
 *
 *  @remarks
 * The hook memoizes the auth providers based on the current URL to prevent unnecessary
 * recalculations. Each provider includes name, title, and pre-configured login URL.
 *
 * @example
 * ```tsx
 * const LoginComponent = () => {
 *   const providers = useLoginLinks()
 *   return (
 *     <div>
 *       {providers.map((provider) => (
 *         <a key={provider.name} href={provider.url}>
 *           Login with {provider.title}
 *         </a>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export const useLoginLinks = (): AuthProvider[] => {
  // Memoize auth providers based on current URL to prevent unnecessary recalculations
  const authProviders = useMemo(
    () => getAuthProviders(window.location.href),
    [window.location.href],
  )
  return authProviders
}

/**
 * Re-export AuthProvider type
 *
 * @public
 */
export type {AuthProvider}
