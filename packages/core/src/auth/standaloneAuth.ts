import {type Subscription} from 'rxjs'

import {type StoreContext} from '../store/defineStore'
import {AuthStateType} from './authStateType'
import {type AuthStoreState} from './authStore'
import {type AuthStrategyOptions, type AuthStrategyResult} from './authStrategy'
import {refreshStampedToken} from './refreshStampedToken'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getAuthCode, getDefaultStorage, getTokenFromLocation, getTokenFromStorage} from './utils'

/**
 * Resolves the initial auth state for Standalone mode.
 *
 * Token discovery order:
 * 1. Provided token (`auth.token` in config)
 * 2. Auth code or token from location (OAuth callback)
 * 3. localStorage: `__sanity_auth_token`
 * 4. Falls back to `LOGGED_OUT`
 *
 * @internal
 */
export function getStandaloneInitialState(options: AuthStrategyOptions): AuthStrategyResult {
  const {authConfig, initialLocationHref} = options
  const providedToken = authConfig.token
  const callbackUrl = authConfig.callbackUrl
  const storageKey = '__sanity_auth_token'
  const storageArea = authConfig.storageArea ?? getDefaultStorage()

  // Provided token always wins
  if (providedToken) {
    return {
      authState: {type: AuthStateType.LOGGED_IN, token: providedToken, currentUser: null},
      storageKey,
      storageArea,
      authMethod: undefined,
      dashboardContext: {},
    }
  }

  // Check for auth code or token-from-location (OAuth callback)
  if (getAuthCode(callbackUrl, initialLocationHref) || getTokenFromLocation(initialLocationHref)) {
    return {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: false},
      storageKey,
      storageArea,
      authMethod: undefined,
      dashboardContext: {},
    }
  }

  // Try localStorage
  const token = getTokenFromStorage(storageArea, storageKey)
  if (token) {
    return {
      authState: {type: AuthStateType.LOGGED_IN, token, currentUser: null},
      storageKey,
      storageArea,
      authMethod: 'localstorage',
      dashboardContext: {},
    }
  }

  // No token found
  return {
    authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    storageKey,
    storageArea,
    authMethod: undefined,
    dashboardContext: {},
  }
}

/**
 * Initialize Standalone auth subscriptions:
 * - Subscribe to state changes and fetch current user
 * - Subscribe to storage events for token key
 * - Start stamped token refresh
 *
 * @internal
 */
export function initializeStandaloneAuth(
  context: StoreContext<AuthStoreState>,
  tokenRefresherRunning: boolean,
): {dispose: () => void; tokenRefresherStarted: boolean} {
  const subscriptions: Subscription[] = []
  let startedRefresher = false

  subscriptions.push(subscribeToStateAndFetchCurrentUser(context, {useProjectHostname: false}))

  const storageArea = context.state.get().options?.storageArea
  if (storageArea) {
    subscriptions.push(subscribeToStorageEventsAndSetToken(context))
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
