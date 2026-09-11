import {startOAuthAuthorization} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * A React hook that returns a function for starting the OAuth authorization-code + PKCE flow.
 *
 * @remarks
 * The returned function invokes core's `startOAuthAuthorization`, which generates
 * the PKCE `code_verifier`, `code_challenge` and `state`, persists the verifier and
 * state to `sessionStorage`, and navigates the browser to the authorize endpoint.
 * `clientId`, `redirectUri` and `organizationId` are read from the instance's
 * `auth.oauth` config. It throws if the instance has no `auth.oauth` config.
 *
 * Pair with {@link useOAuthCallback} on the redirect URI to complete the flow.
 *
 * @example
 * ```tsx
 * function LoginButton() {
 *   const authorize = useOAuthAuthorize()
 *   return <button onClick={() => authorize()}>Sign in</button>
 * }
 * ```
 *
 * @returns A function that starts the OAuth flow by navigating to the authorization URL
 * @public
 */
export const useOAuthAuthorize = createCallbackHook(startOAuthAuthorization)
