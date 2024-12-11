import {type AuthStore, getAuthStore} from '@sanity/sdk'
import {useMemo} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * A React hook that returns a function for handling authentication callbacks.
 *
 * @remarks
 * This hook provides access to the authentication store's callback handler,
 * which processes auth redirects by extracting the session ID and fetching the
 * authentication token. If fetching the long-lived token is successful,
 * `handleCallback` will return a Promise that resolves a new location that
 * removes the short-lived token from the URL. Use this in combination with
 * `history.replaceState` or your own router's `replace` function to update the
 * current location without triggering a reload.
 *
 * @example
 * ```tsx
 * function AuthCallback() {
 *   const handleCallback = useHandleCallback()
 *   const router = useRouter() // Example router
 *
 *   useEffect(() => {
 *     async function processCallback() {
 *       // Handle the callback and get the cleaned URL
 *       const newUrl = await handleCallback(window.location.href)
 *
 *       if (newUrl) {
 *         // Replace URL without triggering navigation
 *         router.replace(newUrl, {shallow: true})
 *       }
 *     }
 *
 *     processCallback().catch(console.error)
 *   }, [handleCallback, router])
 *
 *   return <div>Completing login...</div>
 * }
 * ```
 *
 * @returns A callback handler function that processes OAuth redirects
 * @public
 */
export function useHandleCallback(): AuthStore['handleCallback'] {
  const instance = useSanityInstance()
  const authStore = useMemo(() => getAuthStore(instance), [instance])

  return authStore.handleCallback
}
