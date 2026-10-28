import {ClientError} from '@sanity/client'

import {type StoreContext} from '../../store/defineStore'
import {getAuthLogger} from '../authLogger'
import {AuthStateType} from '../authStateType'
import {type AuthStoreState} from '../authStore'
import {createLoggedInAuthState, toCredential} from '../utils'
import {
  appendResourceIndicator,
  type ConfiguredOAuthOptions,
  createOAuthClient,
  deserializeTokens,
  getOAuthOptions,
  postTokenRequest,
  serializeTokens,
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
 * callers share a single in-flight request, and tabs on the same origin take
 * turns through a Web Lock: a tab that waited adopts the tokens the other tab
 * stored instead of spending a refresh token that has been rotated. An
 * unrecoverable failure (a 4xx rejecting the refresh token) clears the tokens
 * and transitions to `LOGGED_OUT`; transient failures (network, 5xx, rate
 * limits) leave the session intact and rethrow so the caller can retry. The
 * resolved tokens omit the refresh token, which core retains internally for
 * subsequent refreshes.
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
  const {state} = context
  let oauth: ConfiguredOAuthOptions['oauth']
  try {
    oauth = getOAuthOptions(state.get()).oauth
  } catch (error) {
    return Promise.reject(error)
  }
  const startedWith = state.get().oauthTokens?.accessToken
  // Only one tab on this origin spends a refresh token at a time. Without Web
  // Locks (server, insecure contexts) the refresh runs directly.
  const locked =
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(
          `sanity-oauth-refresh:${oauth.clientId}`,
          {signal: AbortSignal.timeout(REFRESH_LOCK_TIMEOUT_MS)},
          () => doRefreshOAuthTokens(context, startedWith),
        )
      : doRefreshOAuthTokens(context, startedWith)
  const refresh = locked.finally(() => {
    refreshInFlight = null
    state.set('oauthRefreshSettled', {pendingCredential: undefined})
  })
  refreshInFlight = refresh
  // Clients hold requests until the refresh settles, then send whatever it
  // left behind: the new token, the old one after a transient failure, or
  // nothing after a logout.
  const settledCredential = () => {
    const {authState, options} = state.get()
    return toCredential(
      authState.type === AuthStateType.LOGGED_IN ? authState.token : null,
      options.authMethod,
    )
  }
  state.set('oauthRefreshStarted', {
    pendingCredential: refresh.then(settledCredential, settledCredential),
  })
  return refresh
}

/** How long to wait for another tab's refresh before giving up as a transient failure. */
const REFRESH_LOCK_TIMEOUT_MS = 30_000

/**
 * Another tab may have refreshed while this one waited for the lock. That
 * refresh rotated the refresh token this tab started with, so storage has the
 * only tokens still worth using. Returns them while the access token is valid;
 * otherwise the caller refreshes with them. The other tab's `storage` event may
 * already have put them in this tab's state.
 */
function adoptTokensFromOtherTab(
  state: StoreContext<AuthStoreState>['state'],
  options: ConfiguredOAuthOptions,
  startedWith: string | undefined,
): OAuthTokens | null {
  const stored = deserializeTokens(options.storageArea?.getItem(options.storageKey) ?? null)
  if (!stored || stored.accessToken === startedWith) return null
  if (stored.expiresAt.getTime() <= Date.now()) {
    // the expired access token stays out of the auth state, where it would
    // refetch the current user and fail with a 401
    state.set('oauthTokensFromOtherTab', {oauthTokens: stored})
    return null
  }
  if (stored.accessToken !== state.get().oauthTokens?.accessToken) {
    state.set('oauthTokensFromOtherTab', {
      authState: createLoggedInAuthState(stored.accessToken, null),
      oauthTokens: stored,
    })
  }
  return stored
}

async function doRefreshOAuthTokens(
  {state, instance}: StoreContext<AuthStoreState>,
  startedWith: string | undefined,
): Promise<Omit<OAuthTokens, 'refreshToken'> | null> {
  const logger = getAuthLogger(instance)
  const options = getOAuthOptions(state.get())

  const adopted = adoptTokensFromOtherTab(state, options, startedWith)
  if (adopted) {
    logger.info('OAuth tokens already refreshed by another tab')
    const {refreshToken: _refreshToken, ...publicTokens} = adopted
    return publicTokens
  }

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
    })
    appendResourceIndicator(params, options.oauth)
    const response = await postTokenRequest(client, params, 'oauth.refresh')

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
