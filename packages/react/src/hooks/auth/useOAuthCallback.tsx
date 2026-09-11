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
 * all in core. On success it resolves the same-origin location the user was on
 * when the flow started (so deep links survive login), otherwise the callback
 * URL cleaned of the OAuth params (`code`, `state`, `error`,
 * `error_description`). It resolves `false` when there was nothing to handle.
 * The resolved URL may be a different route, so navigate to it rather than
 * only calling `history.replaceState`.
 *
 * `AuthBoundary` runs this for you when the app lands on the OAuth redirect
 * URI. Reach for this hook only when building a custom callback component.
 *
 * Concurrent calls are single-flight in core, so React StrictMode's double
 * invocation will not trigger a second code exchange, and a repeated call with
 * a stale callback URL is ignored once a session is established.
 *
 * @example
 * ```tsx
 * function OAuthCallback() {
 *   const handleOAuthCallback = useOAuthCallback()
 *   const navigate = useNavigate() // your router's navigation
 *
 *   useEffect(() => {
 *     handleOAuthCallback(window.location.href)
 *       .then((nextUrl) => {
 *         // Returns the user to where they started, with OAuth params removed
 *         if (nextUrl) navigate(nextUrl, {replace: true})
 *       })
 *       .catch(console.error)
 *   }, [handleOAuthCallback, navigate])
 *
 *   return <div>Completing sign-in…</div>
 * }
 * ```
 *
 * @returns A callback handler that processes the OAuth redirect
 * @public
 */
export const useOAuthCallback = createCallbackHook(handleOAuthCallback)
