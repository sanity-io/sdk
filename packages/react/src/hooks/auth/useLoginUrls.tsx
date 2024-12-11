import {type AuthProvider, getAuthStore} from '@sanity/sdk'
import {useEffect, useMemo, useState} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * A React hook that retrieves the available authentication provider URLs for login.
 *
 * @remarks
 * This hook fetches the login URLs from the Sanity auth store when the component mounts.
 * Each provider object contains information about an authentication method, including its URL.
 *
 * @example
 * ```tsx
 * function LoginComponent() {
 *   const providers = useLoginUrls()
 *
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
 *
 * @returns An array of {@link AuthProvider} objects containing login URLs and provider information
 * @public
 */
export function useLoginUrls(): AuthProvider[] {
  const [providers, setProviders] = useState<AuthProvider[]>([])
  const instance = useSanityInstance()
  const authStore = useMemo(() => getAuthStore(instance), [instance])

  useEffect(() => {
    const authProviders = authStore.getLoginUrls()
    // Handle both synchronous cached and asynchronous fetch cases
    if (authProviders instanceof Promise) {
      authProviders.then(setProviders)
    } else {
      setProviders(authProviders)
    }
  }, [authStore])

  return providers
}
