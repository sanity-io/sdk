import {type Subscription} from 'rxjs'

import {type StoreContext} from '../store/defineStore'
import {DEFAULT_BASE} from './authConstants'
import {AuthStateType} from './authStateType'
import {type AuthStoreState, type DashboardContext} from './authStore'
import {type AuthStrategyOptions, type AuthStrategyResult} from './authStrategy'
import {refreshStampedToken} from './refreshStampedToken'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {getAuthCode, getTokenFromLocation} from './utils'

/**
 * Parses the dashboard context from a location href's `_context` URL parameter.
 * Strips the `sid` property from the parsed context (it's handled separately).
 *
 * @internal
 */
function parseDashboardContext(locationHref: string): {
  dashboardContext: DashboardContext
  isInDashboard: boolean
} {
  try {
    const parsedUrl = new URL(locationHref, DEFAULT_BASE)
    const contextParam = parsedUrl.searchParams.get('_context')
    if (contextParam) {
      const parsedContext = JSON.parse(contextParam)

      if (
        parsedContext &&
        typeof parsedContext === 'object' &&
        Object.keys(parsedContext).length > 0
      ) {
        // Explicitly remove the 'sid' property before assigning
        delete parsedContext.sid
        return {dashboardContext: parsedContext as DashboardContext, isInDashboard: true}
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse dashboard context from initial location:', err)
  }
  return {dashboardContext: {}, isInDashboard: false}
}

/**
 * Resolves the initial auth state for Dashboard mode.
 *
 * In dashboard mode the token is provided by the parent frame via Comlink,
 * so the SDK starts in a `LOGGED_OUT` state and waits for the token to arrive.
 * The `_context` URL parameter provides dashboard metadata (orgId, mode, env).
 *
 * A provided token (`auth.token`) or an auth code/callback still takes
 * precedence, even when running inside the dashboard.
 *
 * @internal
 */
export function getDashboardInitialState(options: AuthStrategyOptions): AuthStrategyResult {
  const {authConfig, initialLocationHref} = options
  const providedToken = authConfig.token
  const callbackUrl = authConfig.callbackUrl
  const storageKey = '__sanity_auth_token'

  const {dashboardContext} = parseDashboardContext(initialLocationHref)

  // Dashboard does NOT use localStorage — token comes from the parent frame
  const storageArea = undefined

  // Provided token always wins, even in dashboard
  if (providedToken) {
    return {
      authState: {type: AuthStateType.LOGGED_IN, token: providedToken, currentUser: null},
      storageKey,
      storageArea,
      authMethod: undefined,
      dashboardContext,
    }
  }

  // Check for auth code or token-from-location (callback handling)
  if (getAuthCode(callbackUrl, initialLocationHref) || getTokenFromLocation(initialLocationHref)) {
    return {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: false},
      storageKey,
      storageArea,
      authMethod: undefined,
      dashboardContext,
    }
  }

  // Default: logged out, waiting for Comlink to provide token
  return {
    authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    storageKey,
    storageArea,
    authMethod: undefined,
    dashboardContext,
  }
}

/**
 * Initialize Dashboard auth subscriptions:
 * - Subscribe to state changes and fetch current user
 * - Start stamped token refresh
 *
 * Note: storage events are NOT subscribed in dashboard mode since
 * the dashboard does not use localStorage for token persistence.
 *
 * @internal
 */
export function initializeDashboardAuth(
  context: StoreContext<AuthStoreState>,
  tokenRefresherRunning: boolean,
): {dispose: () => void; tokenRefresherStarted: boolean} {
  const subscriptions: Subscription[] = []
  let startedRefresher = false

  subscriptions.push(subscribeToStateAndFetchCurrentUser(context, {useProjectHostname: false}))

  // Dashboard does not subscribe to storage events

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
