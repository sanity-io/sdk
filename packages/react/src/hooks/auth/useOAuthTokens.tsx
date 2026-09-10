import {
  getOAuthTokensState,
  type OAuthTokens,
  refreshOAuthTokens,
  revokeOAuthTokens,
} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'
import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * The current OAuth token state, plus actions to refresh and revoke it.
 *
 * @public
 */
export interface UseOAuthTokensResult {
  /** The stored OAuth tokens, or `null` when not logged in via OAuth */
  tokens: OAuthTokens | null
  /**
   * Returns whether the access token has expired, comparing `expiresAt` against
   * the current time at the moment it is called.
   */
  isExpired: () => boolean
  /** Refresh via the OAuth `refresh_token` grant  */
  refresh: () => Promise<OAuthTokens | null>
  /** Revoke and clear stored tokens */
  revoke: () => Promise<void>
}

const useOAuthTokensState = createStateSourceHook(getOAuthTokensState)
const useRefreshOAuthTokens = createCallbackHook(refreshOAuthTokens)
const useRevokeOAuthTokens = createCallbackHook(revokeOAuthTokens)

function isOAuthTokenExpired(tokens: OAuthTokens | null, now: number = Date.now()): boolean {
  return tokens ? tokens.expiresAt.getTime() <= now : false
}

/**
 * A React hook that exposes the stored OAuth token state along with `refresh`
 * and `revoke` actions.
 *
 * @remarks
 * The token view is a synchronous read over core's token state source, so the
 * hook re-renders whenever tokens change — including changes made in another
 * tab, which core propagates via `storage` events.
 *
 * @returns The current {@link UseOAuthTokensResult}
 *
 * @example
 * ```tsx
 * function TokenStatus() {
 *   const {tokens, isExpired, refresh, revoke} = useOAuthTokens()
 *
 *   if (!tokens) return <div>Not signed in</div>
 *
 *   return (
 *     <div>
 *       <p>{isExpired() ? 'Token expired' : 'Token valid'}</p>
 *       <button onClick={() => refresh()}>Refresh</button>
 *       <button onClick={() => revoke()}>Sign out</button>
 *     </div>
 *   )
 * }
 * ```
 *
 * @public
 */
export function useOAuthTokens(): UseOAuthTokensResult {
  const tokens = useOAuthTokensState()
  return {
    tokens,
    isExpired: () => isOAuthTokenExpired(tokens),
    refresh: useRefreshOAuthTokens(),
    revoke: useRevokeOAuthTokens(),
  }
}
