import {defer, distinctUntilChanged, filter, map, type Subscription} from 'rxjs'

import {type StoreContext} from '../../store/defineStore'
import {DEFAULT_BASE} from '../authConstants'
import {AuthStateType} from '../authStateType'
import {type AuthStoreState} from '../authStore'
import {type AuthStrategyOptions, type AuthStrategyResult} from '../authStrategy'
import {subscribeToStateAndFetchCurrentUser} from '../subscribeToStateAndFetchCurrentUser'
import {createLoggedInAuthState, getDefaultStorage, getStorageEvents} from '../utils'
import {runOAuthTokenRefresh} from './oauthRefresh'
import {type OAuthTokens} from './types'

/** localStorage (or configured `storageArea`) key for persisted OAuth tokens. */
export const OAUTH_TOKENS_KEY = '__sanity_oauth_tokens'

/** The persisted JSON shape of {@link OAuthTokens}, `expiresAt` as an ISO string. */
interface SerializedOAuthTokens extends Omit<OAuthTokens, 'expiresAt'> {
  expiresAt: string
}

/**
 * Parses persisted token JSON back into {@link OAuthTokens}. Returns `null`
 * when the value is missing or malformed, including an `expiresAt` that does
 * not parse to a valid date (an `Invalid Date` would otherwise read as never
 * expiring, since `NaN <= now` is always `false`).
 *
 * @internal
 */
export function deserializeTokens(raw: string | null): OAuthTokens | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('accessToken' in parsed) ||
      typeof (parsed as SerializedOAuthTokens).accessToken !== 'string' ||
      !('expiresAt' in parsed) ||
      typeof (parsed as SerializedOAuthTokens).expiresAt !== 'string'
    ) {
      return null
    }
    const value = parsed as SerializedOAuthTokens
    const expiresAt = new Date(value.expiresAt)
    if (Number.isNaN(expiresAt.getTime())) return null
    return {
      accessToken: value.accessToken,
      tokenType: 'bearer',
      expiresIn: value.expiresIn,
      expiresAt,
      ...(value.refreshToken !== undefined && {refreshToken: value.refreshToken}),
    }
  } catch {
    return null
  }
}

/**
 * Reads the persisted tokens, discarding entries that can never lead to a
 * session: corrupt JSON, or an expired access token with no refresh token.
 * Dropping them from storage stops them shadowing a fresh login.
 */
function readPersistedTokens(
  storageArea: Storage | undefined,
): {tokens: OAuthTokens; expired: boolean} | null {
  const raw = storageArea?.getItem(OAUTH_TOKENS_KEY) ?? null
  const tokens = deserializeTokens(raw)
  const expired = tokens !== null && tokens.expiresAt.getTime() <= Date.now()
  if (tokens && (!expired || tokens.refreshToken)) return {tokens, expired}
  if (raw) storageArea?.removeItem(OAUTH_TOKENS_KEY)
  return null
}

/**
 * Resolves the initial auth state for OAuth mode.
 *
 * State discovery order:
 * 1. Persisted tokens in `__sanity_oauth_tokens` → `LOGGED_IN`, or
 *    `LOGGING_IN` when the access token has expired but a refresh token is
 *    available (`initializeOauthAuth` then refreshes). Corrupt or expired
 *    tokens without a refresh token are discarded.
 * 2. Callback URL (contains `code` or `error` and matches `redirectUri`)
 *    → `LOGGING_IN`
 * 3. Otherwise → `LOGGED_OUT`
 *
 * @internal
 */
export function getOauthInitialState(options: AuthStrategyOptions): AuthStrategyResult {
  const {authConfig, initialLocationHref} = options
  const storageKey = OAUTH_TOKENS_KEY
  const storageArea = authConfig.storageArea ?? getDefaultStorage()
  const redirectUri = authConfig.oauth?.redirectUri

  // Persisted tokens win
  const persisted = readPersistedTokens(storageArea)
  if (persisted) {
    const {tokens, expired} = persisted
    return {
      // An expired token is not usable yet; `isExchangingToken` also makes
      // handleOAuthCallback stand down until the refresh has settled.
      authState: expired
        ? {type: AuthStateType.LOGGING_IN, isExchangingToken: true}
        : createLoggedInAuthState(tokens.accessToken, null),
      storageKey,
      storageArea,
      authMethod: 'localstorage',
      dashboardContext: {},
      oauthTokens: tokens,
    }
  }

  // Callback URL with code/error whose origin + pathname match our redirect
  // URI (query and hash are ignored). `state` alone is not a callback: the
  // server always sends `code` or `error`, and handleOAuthCallback would
  // otherwise leave the app stuck in LOGGING_IN.
  const {searchParams} = new URL(initialLocationHref, DEFAULT_BASE)
  const isCallback = searchParams.has('code') || searchParams.has('error')
  if (redirectUri && isCallback) {
    const loc = new URL(initialLocationHref, DEFAULT_BASE)
    const redirect = new URL(redirectUri, DEFAULT_BASE)
    if (loc.origin === redirect.origin && loc.pathname === redirect.pathname) {
      return {
        authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: false},
        storageKey,
        storageArea,
        authMethod: undefined,
        dashboardContext: {},
      }
    }
  }

  // No tokens, not a callback
  return {
    authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    storageKey,
    storageArea,
    authMethod: undefined,
    dashboardContext: {},
  }
}

/**
 * Subscribes to cross-tab `storage` events for the OAuth tokens key, syncing
 * this tab's auth state when tokens change in another tab.
 *
 * @internal
 */
export function subscribeToOAuthStorageEvents({state}: StoreContext<AuthStoreState>): Subscription {
  const {storageArea} = state.get().options

  const tokens$ = defer(getStorageEvents).pipe(
    filter((e) => e.storageArea === storageArea && e.key === OAUTH_TOKENS_KEY),
    map(() => deserializeTokens(storageArea?.getItem(OAUTH_TOKENS_KEY) ?? null)),
    distinctUntilChanged((a, b) => a?.accessToken === b?.accessToken),
  )

  return tokens$.subscribe((tokens) => {
    state.set('updateOAuthTokensFromStorageEvent', {
      authState: tokens
        ? createLoggedInAuthState(tokens.accessToken, null)
        : {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
      oauthTokens: tokens ?? undefined,
    })
  })
}

/**
 * Initialize OAuth auth subscriptions:
 * - Refresh persisted tokens that expired while the app was closed
 * - Subscribe to state changes and fetch current user
 * - Subscribe to cross-tab storage events for the OAuth tokens key
 *
 * OAuth tokens are refreshed via the `refresh_token` grant (see
 * `refreshOAuthTokens`), so the stamped-token refresher is not started here.
 *
 * @internal
 */
export function initializeOauthAuth(context: StoreContext<AuthStoreState>): {
  dispose: () => void
  tokenRefresherStarted: boolean
} {
  const subscriptions: Subscription[] = []

  const {authState, oauthTokens, options} = context.state.get()
  if (authState.type === AuthStateType.LOGGING_IN && oauthTokens) {
    // getOauthInitialState handed us expired tokens with a refresh token.
    // Unrecoverable failures already end in LOGGED_OUT; a transient one is
    // surfaced rather than leaving the app stuck in LOGGING_IN.
    runOAuthTokenRefresh(context).catch((error) => {
      context.state.set('oauthStartupRefreshError', {
        authState: {type: AuthStateType.ERROR, error},
      })
    })
  }

  subscriptions.push(subscribeToStateAndFetchCurrentUser(context, {useProjectHostname: false}))

  const storageArea = options?.storageArea
  if (storageArea) {
    subscriptions.push(subscribeToOAuthStorageEvents(context))
  }

  return {
    dispose: () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
    },
    tokenRefresherStarted: false,
  }
}
