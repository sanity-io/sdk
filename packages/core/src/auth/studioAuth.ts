import {type Subscription} from 'rxjs'

import {type TokenSource} from '../config/sanityConfig'
import {type StoreContext} from '../store/defineStore'
import {AuthStateType} from './authStateType'
import {type AuthStoreState, type LoggedInAuthState} from './authStore'
import {type AuthStrategyOptions, type AuthStrategyResult} from './authStrategy'
import {refreshStampedToken} from './refreshStampedToken'
import {checkForCookieAuth, getStudioTokenFromLocalStorage} from './studioModeAuth'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getDefaultStorage} from './utils'

/**
 * Resolves the initial auth state for Studio mode.
 *
 * When a `tokenSource` is provided (via `config.studio.auth.token`), the
 * initial state is `LOGGING_IN` — the actual token arrives asynchronously
 * via the subscription set up in `initializeStudioAuth`.
 *
 * Fallback token discovery order (no tokenSource):
 * 1. Provided token (`auth.token` in config)
 * 2. localStorage: `__studio_auth_token_${projectId}`
 * 3. Falls back to `LOGGED_OUT` (cookie auth is checked async in `initializeStudioAuth`)
 *
 * @internal
 */
export function getStudioInitialState(options: AuthStrategyOptions): AuthStrategyResult {
  const {authConfig, projectId, tokenSource} = options
  const storageArea = authConfig.storageArea ?? getDefaultStorage()
  const studioStorageKey = `__studio_auth_token_${projectId ?? ''}`

  // When a reactive token source is available, start in LOGGING_IN state.
  // The actual token will arrive via subscription in initializeStudioAuth.
  if (tokenSource) {
    return {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: false},
      storageKey: studioStorageKey,
      storageArea,
      authMethod: undefined,
      dashboardContext: {},
    }
  }

  // Fallback: discover token from config or localStorage
  const providedToken = authConfig.token

  // Check localStorage first — mirrors original authStore behavior where
  // the localStorage read always runs before the providedToken check.
  let authMethod: AuthStrategyResult['authMethod'] = undefined
  const token = getStudioTokenFromLocalStorage(storageArea, studioStorageKey)
  if (token) {
    authMethod = 'localstorage'
  }

  if (providedToken) {
    return {
      authState: {type: AuthStateType.LOGGED_IN, token: providedToken, currentUser: null},
      storageKey: studioStorageKey,
      storageArea,
      authMethod,
      dashboardContext: {},
    }
  }

  if (token) {
    return {
      authState: {type: AuthStateType.LOGGED_IN, token, currentUser: null},
      storageKey: studioStorageKey,
      storageArea,
      authMethod: 'localstorage',
      dashboardContext: {},
    }
  }

  // No token found — start logged out, cookie auth will be checked asynchronously
  return {
    authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    storageKey: studioStorageKey,
    storageArea,
    authMethod: undefined,
    dashboardContext: {},
  }
}

/**
 * Initialize Studio auth subscriptions.
 *
 * When a `tokenSource` is available (reactive path), subscribes to it for
 * ongoing token sync. The Studio is the token authority — no independent
 * token refresh or cookie auth probing is needed.
 *
 * Fallback path (no tokenSource):
 * - Subscribe to state changes and fetch current user
 * - Subscribe to storage events for studio token key
 * - Check for cookie auth asynchronously if no token was found
 * - Start stamped token refresh
 *
 * @internal
 */
export function initializeStudioAuth(
  context: StoreContext<AuthStoreState>,
  tokenRefresherRunning: boolean,
): {dispose: () => void; tokenRefresherStarted: boolean} {
  const tokenSource = context.instance.config.studio?.auth?.token

  // Reactive token path — Studio provides the token
  if (tokenSource) {
    return initializeWithTokenSource(context, tokenSource)
  }

  // Fallback path — discover token from localStorage/cookies
  return initializeWithFallback(context, tokenRefresherRunning)
}

/**
 * Subscribe to a reactive token source from the Studio workspace.
 *
 * When the token source emits a non-null token, the SDK uses it directly.
 * When it emits `null`, the behavior depends on the `authenticated` flag
 * from the Studio's workspace config:
 *
 * - `authenticated: true` — the Studio has already verified the user is
 *   logged in (e.g. via cookie auth). The SDK treats the null token as
 *   cookie-based auth and stays in the LOGGED_IN state.
 *
 * - `authenticated` absent/false — the user is genuinely not authenticated;
 *   transition to LOGGED_OUT.
 *
 * No async cookie probing is needed here because this code path only runs
 * when a Studio provides SDKStudioContext, and the Studio's Workspace type
 * always includes `authenticated`. The async `checkForCookieAuth` fallback
 * remains in `initializeWithFallback` for the non-Studio path.
 */
function initializeWithTokenSource(
  context: StoreContext<AuthStoreState>,
  tokenSource: TokenSource,
): {dispose: () => void; tokenRefresherStarted: boolean} {
  const subscriptions: Subscription[] = []
  const studioAuthenticated = context.instance.config.studio?.authenticated === true

  // Subscribe to the current user fetcher — runs whenever auth state changes
  subscriptions.push(subscribeToStateAndFetchCurrentUser(context, {useProjectHostname: true}))

  // Subscribe to the Studio's token stream
  const tokenSub = tokenSource.subscribe({
    next: (token) => {
      const {state} = context
      if (token) {
        // Studio provided a real token — use it directly
        state.set('studioTokenSource', (prev) => ({
          options: {...prev.options, authMethod: undefined},
          authState: {type: AuthStateType.LOGGED_IN, token, currentUser: null},
        }))
      } else if (studioAuthenticated) {
        // The Studio says the user is authenticated — null token means
        // cookie-based auth is in use. Stay logged in with cookie method.
        state.set('studioTokenSourceCookieAuth', (prev) => ({
          options: {...prev.options, authMethod: 'cookie'},
          authState:
            prev.authState.type === AuthStateType.LOGGED_IN
              ? prev.authState
              : {type: AuthStateType.LOGGED_IN, token: '', currentUser: null},
        }))
      } else {
        // No token and Studio doesn't confirm authentication — logged out
        state.set('studioTokenSourceLoggedOut', (prev) => ({
          options: {...prev.options, authMethod: undefined},
          authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
        }))
      }
    },
  })

  return {
    dispose: () => {
      tokenSub.unsubscribe()
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
    },
    // Studio handles token refresh — do not start the SDK's refresher
    tokenRefresherStarted: false,
  }
}

/**
 * Fallback initialization when no reactive token source is available.
 * Uses localStorage/cookie discovery (existing behavior).
 */
function initializeWithFallback(
  context: StoreContext<AuthStoreState>,
  tokenRefresherRunning: boolean,
): {dispose: () => void; tokenRefresherStarted: boolean} {
  const subscriptions: Subscription[] = []
  let startedRefresher = false

  subscriptions.push(subscribeToStateAndFetchCurrentUser(context, {useProjectHostname: true}))

  const storageArea = context.state.get().options?.storageArea
  if (storageArea) {
    subscriptions.push(subscribeToStorageEventsAndSetToken(context))
  }

  // If no token found during getInitialState, try cookie auth asynchronously
  try {
    const {instance, state} = context
    const token: string | null =
      state.get().authState?.type === AuthStateType.LOGGED_IN
        ? (state.get().authState as LoggedInAuthState).token
        : null

    if (!token) {
      const projectIdValue = instance.config.projectId
      const clientFactory = state.get().options.clientFactory
      checkForCookieAuth(projectIdValue, clientFactory).then((isCookieAuthEnabled) => {
        if (!isCookieAuthEnabled) return
        state.set('enableCookieAuth', (prev) => ({
          options: {...prev.options, authMethod: 'cookie'},
          authState:
            prev.authState.type === AuthStateType.LOGGED_IN
              ? prev.authState
              : {type: AuthStateType.LOGGED_IN, token: '', currentUser: null},
        }))
      })
    }
  } catch {
    // best-effort cookie detection
  }

  if (!tokenRefresherRunning) {
    startedRefresher = true
    subscriptions.push(refreshStampedToken(context))
  }

  return {
    dispose: () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
    },
    tokenRefresherStarted: startedRefresher,
  }
}
