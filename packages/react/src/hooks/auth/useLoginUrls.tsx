import {type AuthProvider, fetchLoginUrls, getLoginUrlsState} from '@sanity/sdk'
import {useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @internal
 * A React hook that retrieves the available authentication provider URLs for login.
 *
 * @remarks
 * This hook fetches the login URLs from the Sanity auth store when the component mounts.
 * Each provider object contains information about an authentication method, including its URL.
 * The hook will suspend if the login URLs have not yet loaded.
 *
 * @example
 * ```tsx
 * // LoginProviders component that uses the hook
 * function LoginProviders() {
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
 *
 * // Parent component with Suspense boundary
 * function LoginPage() {
 *   return (
 *     <Suspense fallback={<div>Loading authentication providers...</div>}>
 *       <LoginProviders />
 *     </Suspense>
 *   )
 * }
 * ```
 *
 * @returns An array of {@link AuthProvider} objects containing login URLs and provider information
 * @public
 */
export function useLoginUrls(): AuthProvider[] {
  const instance = useSanityInstance()
  const {subscribe, getCurrent} = useMemo(() => getLoginUrlsState(instance), [instance])

  if (!getCurrent()) throw fetchLoginUrls(instance)

  return useSyncExternalStore(subscribe, getCurrent as () => AuthProvider[])
}
