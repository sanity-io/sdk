import {createSelector} from 'reselect'

import {bindActionGlobally} from '../../store/createActionBinder'
import {createStateSourceAction} from '../../store/createStateSourceAction'
import {DEFAULT_BASE} from '../authConstants'
import {getAuthLogger} from '../authLogger'
import {AuthStateType} from '../authStateType'
import {authStore, type AuthStoreState} from '../authStore'
import {createLoggedInAuthState, getDefaultLocation} from '../utils'
import {
  createOAuthClient,
  getOAuthOptions,
  getResourceIndicator,
  serializeTokens,
  type TokenEndpointResponse,
  toOAuthTokens,
} from './oauthClient'
import {runOAuthTokenRefresh} from './oauthRefresh'
import {generateCodeChallenge, generateCodeVerifier, generateState} from './pkce'
import {type OAuthTokens} from './types'

/** sessionStorage key for the PKCE `code_verifier`. */
export const OAUTH_VERIFIER_KEY = '__sanity_oauth_verifier'

/** sessionStorage key for the CSRF `state` value. */
export const OAUTH_STATE_KEY = '__sanity_oauth_state'

/**
 * Starts the OAuth authorization-code + PKCE flow: generates a `code_verifier`,
 * `code_challenge` and `state`, persists the verifier and state to
 * `sessionStorage`, then navigates the browser to the authorize endpoint.
 *
 * @public
 */
export const startOAuthAuthorization = bindActionGlobally(authStore, async ({state, instance}) => {
  const logger = getAuthLogger(instance)
  const options = getOAuthOptions(state.get())

  const codeVerifier = generateCodeVerifier()
  const oauthState = generateState()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  const session = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined
  session?.setItem(OAUTH_VERIFIER_KEY, codeVerifier)
  session?.setItem(OAUTH_STATE_KEY, oauthState)

  const authorizeUrl = new URL(
    '/v1/auth/oauth/authorize',
    options.apiHost ?? 'https://api.sanity.io',
  )
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', options.oauth.clientId)
  authorizeUrl.searchParams.set('redirect_uri', options.oauth.redirectUri)
  authorizeUrl.searchParams.set('state', oauthState)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.append('resource', getResourceIndicator(options.oauth.organizationId))

  logger.info('Starting OAuth authorization')
  if (typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
    window.location.assign(authorizeUrl.toString())
  }
})

/**
 * Handles the OAuth redirect callback: validates `state`, surfaces `error`
 * responses, exchanges the authorization `code` for tokens, persists them, and
 * transitions to `LOGGED_IN`.
 *
 * Returns the callback URL cleaned of OAuth params (for the caller to
 * `history.replaceState`) when a callback was processed, or `false` when there
 * was nothing to handle (no code, or an exchange already in progress). A
 * callback that fails validation while a session is already `LOGGED_IN` (e.g. a
 * remount before the params were stripped) is ignored with a warning and still
 * returns the cleaned URL, so a string result does not imply an exchange ran.
 *
 * @public
 */
export const handleOAuthCallback = bindActionGlobally(
  authStore,
  async (
    {state, instance},
    locationHref: string = getDefaultLocation(),
  ): Promise<string | false> => {
    const logger = getAuthLogger(instance)
    const options = getOAuthOptions(state.get())

    const {authState} = state.get()
    if (authState.type === AuthStateType.LOGGING_IN && authState.isExchangingToken) {
      logger.debug('Skipping OAuth callback - token exchange already in progress')
      return false
    }

    const callbackUrl = new URL(locationHref, DEFAULT_BASE)
    const code = callbackUrl.searchParams.get('code')
    const returnedState = callbackUrl.searchParams.get('state')
    const error = callbackUrl.searchParams.get('error')
    const errorDescription = callbackUrl.searchParams.get('error_description')

    const session = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined

    const cleanedUrlObj = new URL(locationHref, DEFAULT_BASE)
    for (const param of ['code', 'state', 'error', 'error_description']) {
      cleanedUrlObj.searchParams.delete(param)
    }
    const cleanedUrl = cleanedUrlObj.toString()

    // Callback failures move to ERROR, unless a session is already
    // established: a stale callback URL (e.g. remount before the params were
    // stripped, after the artifacts were cleared) or a denied re-authorization
    // must not clobber LOGGED_IN.
    const rejectCallback = (name: string, message: string): string => {
      if (authState.type === AuthStateType.LOGGED_IN) {
        // Leave PKCE artifacts alone: a re-authorization may be in flight.
        logger.warn(`${message} — ignoring callback, session already established`)
        return cleanedUrl
      }
      logger.error(`${message} — rejecting callback`)
      clearOAuthArtifacts(session)
      state.set(name, {authState: {type: AuthStateType.ERROR, error: new Error(message)}})
      return cleanedUrl
    }

    if (error) {
      return rejectCallback(
        'oauthCallbackError',
        errorDescription ? `${error}: ${errorDescription}` : error,
      )
    }

    if (!code) {
      logger.debug('No OAuth code found in callback URL')
      return false
    }

    const storedState = session?.getItem(OAUTH_STATE_KEY) ?? null
    if (!returnedState || !storedState || returnedState !== storedState) {
      return rejectCallback('oauthStateMismatch', 'OAuth state mismatch')
    }

    const codeVerifier = session?.getItem(OAUTH_VERIFIER_KEY) ?? null
    if (!codeVerifier) {
      return rejectCallback('oauthVerifierMissing', 'OAuth code verifier missing')
    }

    logger.info('Exchanging OAuth code for tokens')
    state.set('oauthExchange', {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: true},
    })

    try {
      const client = createOAuthClient(options)
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: options.oauth.redirectUri,
        client_id: options.oauth.clientId,
        resource: getResourceIndicator(options.oauth.organizationId),
      })
      const response = await client.request<TokenEndpointResponse>({
        method: 'POST',
        url: '/auth/oauth/token',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: params.toString(),
        tag: 'oauth.token',
      })

      const tokens = toOAuthTokens(response)
      options.storageArea?.setItem(options.storageKey, serializeTokens(tokens))
      clearOAuthArtifacts(session)

      logger.info('OAuth tokens obtained, user logged in')
      state.set('oauthLoggedIn', {
        authState: createLoggedInAuthState(tokens.accessToken, null),
        oauthTokens: tokens,
      })
      return cleanedUrl
    } catch (exchangeError) {
      logger.error('Failed to exchange OAuth code for tokens', {error: exchangeError})
      clearOAuthArtifacts(session)
      state.set('oauthExchangeError', {
        authState: {type: AuthStateType.ERROR, error: exchangeError},
      })
      return cleanedUrl
    }
  },
)

/**
 * Refreshes the OAuth tokens using the `refresh_token` grant. Concurrent
 * callers share a single in-flight request. An unrecoverable failure (a 4xx
 * rejecting the refresh token) clears the tokens and transitions to
 * `LOGGED_OUT`; transient failures (network, 5xx, rate limits) leave the
 * session intact and rethrow so the caller can retry. The resolved tokens omit
 * the refresh token, which core retains internally for subsequent refreshes.
 *
 * @public
 */
export const refreshOAuthTokens = bindActionGlobally(authStore, runOAuthTokenRefresh)

/**
 * Revokes the OAuth tokens then clears local storage and transitions to `LOGGED_OUT`.
 * Local state is cleared even if the revoke request fails.
 *
 * @public
 */
export const revokeOAuthTokens = bindActionGlobally(authStore, async ({state, instance}) => {
  const logger = getAuthLogger(instance)
  const options = getOAuthOptions(state.get())

  const current = state.get().oauthTokens
  const token = current?.refreshToken ?? current?.accessToken

  try {
    if (token) {
      const client = createOAuthClient(options)
      const params = new URLSearchParams({token, client_id: options.oauth.clientId})
      await client.request<void>({
        method: 'POST',
        url: '/auth/oauth/revoke',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: params.toString(),
        tag: 'oauth.revoke',
      })
      logger.info('OAuth tokens revoked')
    }
  } catch (error) {
    // Revocation is best-effort — local state is cleared regardless.
    logger.warn('OAuth revoke request failed — clearing local state anyway', {error})
  } finally {
    options.storageArea?.removeItem(options.storageKey)
    state.set('oauthRevoked', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
      oauthTokens: undefined,
    })
  }
})

// Memoised so `getCurrent()` keeps returning the same object while
// `oauthTokens` is unchanged; `useSyncExternalStore` loops on a snapshot
// that changes identity every read. One slot suffices: no params, global store.
const selectPublicOAuthTokens = createSelector(
  (state: AuthStoreState) => state.oauthTokens,
  (oauthTokens): Omit<OAuthTokens, 'refreshToken'> | null => {
    if (!oauthTokens) return null
    const {refreshToken: _refreshToken, ...tokens} = oauthTokens
    return tokens
  },
)

/**
 * A state source exposing the current OAuth tokens (including expiry), or
 * `null` when not logged in via OAuth. The refresh token is omitted — it is a
 * long-lived credential held internally by core for `refreshOAuthTokens`, not
 * part of the app-facing token view.
 *
 * @public
 */
export const getOAuthTokensState = bindActionGlobally(
  authStore,
  createStateSourceAction(({state}) => selectPublicOAuthTokens(state)),
)

/** Removes the transient PKCE artifacts from session storage. */
function clearOAuthArtifacts(session: Storage | undefined): void {
  session?.removeItem(OAUTH_VERIFIER_KEY)
  session?.removeItem(OAUTH_STATE_KEY)
}
