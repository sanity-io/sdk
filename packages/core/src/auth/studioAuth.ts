import {type Subscription} from 'rxjs'

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
 * Token discovery order:
 * 1. Provided token (`auth.token` in config)
 * 2. localStorage: `__studio_auth_token_${projectId}`
 * 3. Falls back to `LOGGED_OUT` (cookie auth is checked async in `initializeStudioAuth`)
 *
 * @internal
 */
export function getStudioInitialState(options: AuthStrategyOptions): AuthStrategyResult {
  const {authConfig, projectId} = options
  const providedToken = authConfig.token
  const storageArea = authConfig.storageArea ?? getDefaultStorage()
  const studioStorageKey = `__studio_auth_token_${projectId ?? ''}`

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
 * Initialize Studio auth subscriptions:
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
