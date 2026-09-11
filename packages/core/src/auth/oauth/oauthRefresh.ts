import {ClientError} from '@sanity/client'

import {type StoreContext} from '../../store/defineStore'
import {getAuthLogger} from '../authLogger'
import {AuthStateType} from '../authStateType'
import {type AuthStoreState} from '../authStore'
import {createLoggedInAuthState} from '../utils'
import {
  createOAuthClient,
  getOAuthOptions,
  getResourceIndicator,
  serializeTokens,
  type TokenEndpointResponse,
  toOAuthTokens,
} from './oauthClient'
import {type OAuthTokens} from './types'

/**
 * A refresh failure is unrecoverable only when the token endpoint rejects the
 * refresh token itself (a 4xx). Rate-limit (429) and request-timeout (408)
 * responses, 5xx errors and network failures are transient, so the session is
 * kept intact for the caller to retry rather than forcing a logout.
 */
function isUnrecoverableRefreshError(error: unknown): boolean {
  return error instanceof ClientError && error.statusCode !== 408 && error.statusCode !== 429
}

// Single-flight refresh shared across concurrent callers. Safe as a module
// singleton because `authStore` is a global store (one shared state).
// ponytail: module-level single-flight; upgrade to per-store keying only if
// the auth store ever stops being global.
let refreshInFlight: Promise<Omit<OAuthTokens, 'refreshToken'> | null> | null = null

/**
 * Refreshes the OAuth tokens using the `refresh_token` grant. Concurrent
 * callers share a single in-flight request. An unrecoverable failure (a 4xx
 * rejecting the refresh token) clears the tokens and transitions to
 * `LOGGED_OUT`; transient failures (network, 5xx, rate limits) leave the
 * session intact and rethrow so the caller can retry. The resolved tokens omit
 * the refresh token, which core retains internally for subsequent refreshes.
 *
 * Lives outside `oauthActions` so the auth store's initialisation path can
 * call it without importing the bound actions (which import the store).
 *
 * @internal
 */
export function runOAuthTokenRefresh(
  context: StoreContext<AuthStoreState>,
): Promise<Omit<OAuthTokens, 'refreshToken'> | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = doRefreshOAuthTokens(context).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function doRefreshOAuthTokens({
  state,
  instance,
}: StoreContext<AuthStoreState>): Promise<Omit<OAuthTokens, 'refreshToken'> | null> {
  const logger = getAuthLogger(instance)
  const options = getOAuthOptions(state.get())

  const current = state.get().oauthTokens
  if (!current?.refreshToken) {
    logger.warn('No refresh token available — logging out')
    options.storageArea?.removeItem(options.storageKey)
    state.set('oauthRefreshNoToken', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
      oauthTokens: undefined,
    })
    return null
  }

  try {
    const client = createOAuthClient(options)
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: options.oauth.clientId,
      resource: getResourceIndicator(options.oauth.organizationId),
    })
    const response = await client.request<TokenEndpointResponse>({
      method: 'POST',
      url: '/auth/oauth/token',
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: params.toString(),
      tag: 'oauth.refresh',
    })

    const tokens = toOAuthTokens(response)
    if (!tokens.refreshToken) tokens.refreshToken = current.refreshToken

    options.storageArea?.setItem(options.storageKey, serializeTokens(tokens))
    logger.info('OAuth tokens refreshed')
    state.set('oauthRefreshed', {
      authState: createLoggedInAuthState(tokens.accessToken, null),
      oauthTokens: tokens,
    })
    const {refreshToken: _refreshToken, ...publicTokens} = tokens
    return publicTokens
  } catch (error) {
    if (!isUnrecoverableRefreshError(error)) {
      // Transient (network / 5xx / rate limit) — keep the session so the
      // caller can retry instead of forcing a logout.
      logger.warn('OAuth token refresh failed — keeping session for retry', {error})
      throw error
    }
    logger.error('OAuth token refresh failed — logging out', {error})
    options.storageArea?.removeItem(options.storageKey)
    state.set('oauthRefreshFailed', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
      oauthTokens: undefined,
    })
    throw error
  }
}
