import {type SanityClient} from '@sanity/client'

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
 * was nothing to handle (no code, or an exchange already in progress).
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

    const storedState = session?.getItem(OAUTH_STATE_KEY) ?? null
    if (!returnedState || !storedState || returnedState !== storedState) {
      logger.error('OAuth state mismatch — rejecting callback')
      clearOAuthArtifacts(session)
      state.set('oauthStateMismatch', {
        authState: {type: AuthStateType.ERROR, error: new Error('OAuth state mismatch')},
      })
      return cleanedUrl
    }

    const codeVerifier = session?.getItem(OAUTH_VERIFIER_KEY) ?? null
    if (!codeVerifier) {
      logger.error('OAuth code verifier missing — cannot exchange code')
      clearOAuthArtifacts(session)
      state.set('oauthVerifierMissing', {
        authState: {type: AuthStateType.ERROR, error: new Error('OAuth code verifier missing')},
      })
      return cleanedUrl
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

// Single-flight refresh shared across concurrent callers. Safe as a module
// singleton because `authStore` is a global store (one shared state).
// ponytail: module-level single-flight; upgrade to per-store keying only if
// the auth store ever stops being global.
let refreshInFlight: Promise<OAuthTokens | null> | null = null

/**
 * Refreshes the OAuth tokens using the `refresh_token` grant. Concurrent
 * callers share a single in-flight request. An unrecoverable failure
 * (e.g. `invalid_grant`) clears the tokens and transitions to `LOGGED_OUT`.
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
}
