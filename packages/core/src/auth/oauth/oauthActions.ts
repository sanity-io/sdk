import {ClientError, type SanityClient} from '@sanity/client'

import {bindActionGlobally} from '../../store/createActionBinder'
import {createStateSourceAction} from '../../store/createStateSourceAction'
import {type StoreContext} from '../../store/defineStore'
import {DEFAULT_BASE, REQUEST_TAG_PREFIX} from '../authConstants'
import {getAuthLogger} from '../authLogger'
import {AuthStateType} from '../authStateType'
import {authStore, type AuthStoreState} from '../authStore'
import {createLoggedInAuthState, getDefaultLocation} from '../utils'
import {generateCodeChallenge, generateCodeVerifier, generateState} from './pkce'
import {type OAuthTokens} from './types'

/** sessionStorage key for the PKCE `code_verifier`. */
export const OAUTH_VERIFIER_KEY = '__sanity_oauth_verifier'

/** sessionStorage key for the CSRF `state` value. */
export const OAUTH_STATE_KEY = '__sanity_oauth_state'

/** sessionStorage key for the location to return to after the callback. */
export const OAUTH_RETURN_TO_KEY = '__sanity_oauth_return_to'

const OAUTH_CALLBACK_PARAMS = ['code', 'state', 'error', 'error_description']

/** Strips the OAuth callback params from a URL. */
function stripOAuthParams(href: string): string {
  const url = new URL(href, DEFAULT_BASE)
  for (const param of OAUTH_CALLBACK_PARAMS) url.searchParams.delete(param)
  return url.toString()
}

/** Whether `href` is the registered redirect URI (origin + pathname; query and hash ignored). */
function isCallbackRoute(href: string, redirectUri: string): boolean {
  const current = new URL(href, DEFAULT_BASE)
  const redirect = new URL(redirectUri, DEFAULT_BASE)
  return current.origin === redirect.origin && current.pathname === redirect.pathname
}

interface TokenEndpointResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
}

/** Builds the RFC 8707 resource indicator for an organisation. */
function getResourceIndicator(organizationId: string): string {
  return `urn:io.sanity:organization:${organizationId}`
}

/**
 * Serialises tokens for storage, converting `expiresAt` to an ISO string.
 *
 * @internal
 */
export function serializeTokens(tokens: OAuthTokens): string {
  return JSON.stringify({
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
    expiresAt: tokens.expiresAt.toISOString(),
    ...(tokens.refreshToken !== undefined && {refreshToken: tokens.refreshToken}),
  })
}

type AuthOptions = AuthStoreState['options']
type ConfiguredOAuthOptions = AuthOptions & {oauth: NonNullable<AuthOptions['oauth']>}

/**
 * Reads the store options, throwing when the instance was not configured for
 * OAuth.
 */
function getOAuthOptions(state: AuthStoreState): ConfiguredOAuthOptions {
  const {options} = state
  if (!options.oauth) {
    throw new Error('OAuth is not configured on this instance (missing `auth.oauth`).')
  }
  return options as ConfiguredOAuthOptions
}

/** Creates a client for the (unauthenticated) public OAuth token/revoke calls. */
function createOAuthClient(options: AuthOptions): SanityClient {
  return options.clientFactory({
    apiVersion: 'v1',
    requestTagPrefix: REQUEST_TAG_PREFIX,
    useProjectHostname: false,
    useCdn: false,
    ...(options.apiHost && {apiHost: options.apiHost}),
  })
}

/** Converts a token endpoint response to the {@link OAuthTokens} shape. */
function toOAuthTokens(response: TokenEndpointResponse): OAuthTokens {
  return {
    accessToken: response.access_token,
    tokenType: 'bearer',
    expiresIn: response.expires_in,
    expiresAt: new Date(Date.now() + response.expires_in * 1000),
    ...(response.refresh_token !== undefined && {refreshToken: response.refresh_token}),
  }
}

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
  // The redirect URI must match the registered one exactly, so the current
  // location (deep link) is stashed here and restored by the callback. OAuth
  // params are only stripped when we are already on the callback route, so
  // legitimate app params like `?state=draft` survive the round trip.
  const currentHref = getDefaultLocation()
  if (currentHref !== DEFAULT_BASE) {
    const returnTo = isCallbackRoute(currentHref, options.oauth.redirectUri)
      ? stripOAuthParams(currentHref)
      : currentHref
    session?.setItem(OAUTH_RETURN_TO_KEY, returnTo)
  }

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
 * Returns the URL for the caller to `history.replaceState` to when a callback
 * was processed: on success, the same-origin location the user was on when
 * the flow started (if any), otherwise the callback URL cleaned of OAuth
 * params. Returns `false` when there was nothing to handle (no code, or an
 * exchange already in progress).
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

    const cleanedUrl = stripOAuthParams(locationHref)

    if (error) {
      logger.warn('OAuth callback returned an error', {error, errorDescription})
      clearOAuthArtifacts(session)
      state.set('oauthCallbackError', {
        authState: {
          type: AuthStateType.ERROR,
          error: new Error(errorDescription ? `${error}: ${errorDescription}` : error),
        },
      })
      return cleanedUrl
    }

    if (!code) {
      logger.debug('No OAuth code found in callback URL')
      return false
    }

    // Validation failures move to ERROR, unless a session is already
    // established: a stale callback URL (e.g. remount before the params were
    // stripped, after the artifacts were cleared) must not clobber LOGGED_IN.
    const rejectCallback = (name: string, message: string): string => {
      clearOAuthArtifacts(session)
      if (authState.type === AuthStateType.LOGGED_IN) {
        logger.warn(`${message} — ignoring callback, session already established`)
      } else {
        logger.error(`${message} — rejecting callback`)
        state.set(name, {authState: {type: AuthStateType.ERROR, error: new Error(message)}})
      }
      return cleanedUrl
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
      const returnTo = getSameOriginReturnTo(session, options.oauth.redirectUri)
      clearOAuthArtifacts(session)

      logger.info('OAuth tokens obtained, user logged in')
      state.set('oauthLoggedIn', {
        authState: createLoggedInAuthState(tokens.accessToken, null),
        oauthTokens: tokens,
      })
      return returnTo ?? cleanedUrl
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
let refreshInFlight: Promise<OAuthTokens | null> | null = null

/**
 * Refreshes the OAuth tokens using the `refresh_token` grant. Concurrent
 * callers share a single in-flight request. An unrecoverable failure (a 4xx
 * rejecting the refresh token) clears the tokens and transitions to
 * `LOGGED_OUT`; transient failures (network, 5xx, rate limits) leave the
 * session intact and rethrow so the caller can retry.
 *
 * @public
 */
export const refreshOAuthTokens = bindActionGlobally(authStore, (context) => {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = doRefreshOAuthTokens(context).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
})

async function doRefreshOAuthTokens({
  state,
  instance,
}: StoreContext<AuthStoreState>): Promise<OAuthTokens | null> {
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
    return tokens
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

/**
 * A state source exposing the current OAuth tokens (including expiry), or
 * `null` when not logged in via OAuth.
 *
 * @public
 */
export const getOAuthTokensState = bindActionGlobally(
  authStore,
  createStateSourceAction(({state}) => state.oauthTokens ?? null),
)

/** Removes the transient PKCE artifacts from session storage. */
function clearOAuthArtifacts(session: Storage | undefined): void {
  session?.removeItem(OAUTH_VERIFIER_KEY)
  session?.removeItem(OAUTH_STATE_KEY)
  session?.removeItem(OAUTH_RETURN_TO_KEY)
}

/**
 * Reads the stashed pre-authorize location, only honouring it when it shares
 * the registered redirect URI's origin so a tampered value cannot redirect
 * off-site. (`origin` includes the scheme, so non-http(s) URLs are rejected.)
 */
function getSameOriginReturnTo(session: Storage | undefined, redirectUri: string): string | null {
  const returnTo = session?.getItem(OAUTH_RETURN_TO_KEY) ?? null
  if (!returnTo) return null
  try {
    return new URL(returnTo).origin === new URL(redirectUri).origin ? returnTo : null
  } catch {
    return null
  }
}
