import {handleAuthCallback} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * @internal
 * A React hook that returns a function for handling authentication callbacks.
 *
 * @remarks
 * This hook provides access to the authentication store's callback handler,
 * which processes auth redirects by extracting the session ID and fetching the
 * authentication token. If fetching the long-lived token is successful,
 * `handleAuthCallback` will return a Promise that resolves a new location that
 * removes the short-lived token from the URL. Use this in combination with
 * `history.replaceState` or your own router's `replace` function to update the
 * current location without triggering a reload.
 *
 * @example
 * ```tsx
 * function AuthCallback() {
 *   const handleAuthCallback = useHandleAuthCallback()
 *   const router = useRouter() // Example router
 *
 *   useEffect(() => {
 *     async function processCallback() {
 *       // Handle the callback and get the cleaned URL
 *       const newUrl = await handleAuthCallback(window.location.href)
 *
 *       if (newUrl) {
 *         // Replace URL without triggering navigation
 *         router.replace(newUrl, {shallow: true})
 *       }
 *     }
 *
 *     processCallback().catch(console.error)
 *   }, [handleAuthCallback, router])
 *
 *   return <div>Completing login...</div>
 * }
 * ```
 *
 * @returns A callback handler function that processes OAuth redirects
 * @public
 */
export const useHandleAuthCallback = createCallbackHook(handleAuthCallback)
