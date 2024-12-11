import {getAuthStore} from '@sanity/sdk'
import {useEffect} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useAuthState} from './useAuthState'

/**
 * A React hook that handles the OAuth callback process after user authentication.
 *
 * This hook automatically processes the authentication callback when the auth state
 * is 'logging-in'. It will handle the redirect URL and manage the authentication flow.
 *
 * @remarks
 * The hook should be used in components that handle the OAuth callback redirect.
 * It relies on the auth state being properly managed through the `useAuthState` hook.
 *
 * @example
 * ```tsx
 * function CallbackComponent() {
 *   useHandleCallback();
 *   return <div>Processing login...</div>;
 * }
 * ```
 *
 * @public
 */
export function useHandleCallback(): void {
  const instance = useSanityInstance()
  const authState = useAuthState()
  const authStore = getAuthStore(instance)

  useEffect(() => {
    // Only process the callback when we're in the 'logging-in' state
    if (authState.type === 'logging-in') {
      // Handle the OAuth callback using the current URL
      // This processes tokens and other auth-related parameters from the URL
      authStore.handleCallback(window.location.href).then((callbackResult) => {
        // If we get a redirect URL back, navigate to it
        // This is typically used to return the user to their original location
        // without the sid parameter in the URL
        if (callbackResult) {
          window.location.href = callbackResult
        }
      })
    }
  }, [authState, authStore])
}
