import {handleOAuthCallback} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * A React hook that returns a function for handling the OAuth redirect callback.
 *
 * @remarks
 * This is the OAuth counterpart to `useHandleAuthCallback`. The returned
 * function invokes core's `handleOAuthCallback`, which validates the `state`
 * parameter, surfaces `?error=` redirects, exchanges the authorization `code`
 * for tokens, persists them, and transitions the auth state to `LOGGED_IN` —
 * all in core. It resolves the callback URL cleaned of the OAuth params
 * (`code`, `state`, `error`, `error_description`) so the caller can strip them
 * with `history.replaceState`, or `false` when there was nothing to handle.
 *
 * `AuthBoundary` runs this for you when the app lands on the OAuth redirect
 * URI. Reach for this hook only when building a custom callback component.
 *
 * Concurrent calls are single-flight in core, so React StrictMode's double
 * invocation will not trigger a second code exchange. Calling it again after
 * the exchange has completed, with the OAuth params still in the URL, fails
 * state validation and moves the auth state to `ERROR`, so apply the returned
 * URL before the component can remount.
 *
 * @example
 * ```tsx
 * function OAuthCallback() {
 *   const handleOAuthCallback = useOAuthCallback()
 *
 *   useEffect(() => {
 *     handleOAuthCallback(window.location.href)
 *       .then((cleanedUrl) => {
 *         if (cleanedUrl) {
 *           // Remove the OAuth params from the URL without a reload
 *           history.replaceState(null, '', cleanedUrl)
 *         }
 *       })
 *       .catch(console.error)
 *   }, [handleOAuthCallback])
 *
 *   return <div>Completing sign-in…</div>
 * }
 * ```
 *
 * @returns A callback handler that processes the OAuth redirect
 * @public
 */
export const useOAuthCallback = createCallbackHook(handleOAuthCallback)
