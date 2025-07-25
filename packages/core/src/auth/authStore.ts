import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {type Subscription} from 'rxjs'

import {type AuthConfig, type AuthProvider} from '../config/authConfig'
import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore} from '../store/defineStore'
import {AuthStateType} from './authStateType'
import {refreshStampedToken} from './refreshStampedToken'
import {checkForCookieAuth, getStudioTokenFromLocalStorage} from './studioModeAuth'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {
  getAuthCode,
  getCleanedUrl,
  getDefaultLocation,
  getDefaultStorage,
  getTokenFromLocation,
  getTokenFromStorage,
} from './utils'

/**
 * Represents the various states the authentication can be in.
 *
 * @public
 */
export type AuthState = LoggedInAuthState | LoggedOutAuthState | LoggingInAuthState | ErrorAuthState

/**
 * Logged-in state from the auth state.
 * @public
 */
export type LoggedInAuthState = {
  type: AuthStateType.LOGGED_IN
  token: string
  currentUser: CurrentUser | null
  lastTokenRefresh?: number
}

/**
 * Logged-out state from the auth state.
 * @public
 */
export type LoggedOutAuthState = {type: AuthStateType.LOGGED_OUT; isDestroyingSession: boolean}

/**
 * Logging-in state from the auth state.
 * @public
 */
export type LoggingInAuthState = {type: AuthStateType.LOGGING_IN; isExchangingToken: boolean}

/**
 * Error state from the auth state.
 * @public
 */
export type ErrorAuthState = {type: AuthStateType.ERROR; error: unknown}

/**
 * Represents the various states the authentication can be in.
 *
 * @public
 */
export interface DashboardContext {
  mode?: string
  env?: string
  orgId?: string
}

type AuthMethodOptions = 'localstorage' | 'cookie' | undefined

let tokenRefresherRunning = false

/**
 * @public
 */
export interface AuthStoreState {
  authState: AuthState
  providers?: AuthProvider[]
  options: {
    initialLocationHref: string
    clientFactory: (config: ClientConfig) => SanityClient
    customProviders: AuthConfig['providers']
    storageKey: string
    storageArea: Storage | undefined
    apiHost: string | undefined
    loginUrl: string
    callbackUrl: string | undefined
    providedToken: string | undefined
    authMethod: AuthMethodOptions
  }
  dashboardContext?: DashboardContext
}

export const authStore = defineStore<AuthStoreState>({
  name: 'Auth',
  getInitialState(instance) {
    const {
      apiHost,
      callbackUrl,
      providers: customProviders,
      token: providedToken,
      clientFactory = createClient,
      initialLocationHref = getDefaultLocation(),
    } = instance.config.auth ?? {}
    let storageArea = instance.config.auth?.storageArea

    const storageKey = `__sanity_auth_token`

    // This login URL will only be used for local development
    let loginDomain = 'https://www.sanity.io'
    try {
      if (apiHost && new URL(apiHost).hostname.endsWith('.sanity.work')) {
        loginDomain = 'https://www.sanity.work'
      }
    } catch {
      /* empty */
    }
    const loginUrl = new URL('/login', loginDomain)
    loginUrl.searchParams.set('origin', getCleanedUrl(initialLocationHref))
    loginUrl.searchParams.set('type', 'stampedToken') // Token must be stamped to have an sid passed back
    loginUrl.searchParams.set('withSid', 'true')

    // Check if running in dashboard context by parsing initialLocationHref
    let dashboardContext: DashboardContext = {}
    let isInDashboard = false
    try {
      const parsedUrl = new URL(initialLocationHref)
      const contextParam = parsedUrl.searchParams.get('_context')
      if (contextParam) {
        const parsedContext = JSON.parse(contextParam)

        // Consider it in dashboard if context is present and an object
        if (
          parsedContext &&
          typeof parsedContext === 'object' &&
          Object.keys(parsedContext).length > 0
        ) {
          // Explicitly remove the 'sid' property from the parsed object *before* assigning
          delete parsedContext.sid

          // Now assign the potentially modified object to dashboardContext
          dashboardContext = parsedContext
          isInDashboard = true
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse dashboard context from initial location:', err)
    }

    if (!isInDashboard) {
      // If not in dashboard, use the storage area from the config
      storageArea = storageArea ?? getDefaultStorage()
    }

    let token: string | null
    let authMethod: AuthMethodOptions
    if (instance.config.studioMode?.enabled) {
      token = getStudioTokenFromLocalStorage(storageArea, instance.config.projectId)
      if (token) {
        authMethod = 'localstorage'
      } else {
        checkForCookieAuth(instance.config.projectId, clientFactory).then((isCookieAuthEnabled) => {
          if (isCookieAuthEnabled) {
            authMethod = 'cookie'
          }
        })
      }
    } else {
      token = getTokenFromStorage(storageArea, storageKey)
      if (token) {
        authMethod = 'localstorage'
      }
    }

    let authState: AuthState
    if (providedToken) {
      authState = {type: AuthStateType.LOGGED_IN, token: providedToken, currentUser: null}
    } else if (
      getAuthCode(callbackUrl, initialLocationHref) ||
      getTokenFromLocation(initialLocationHref)
    ) {
      authState = {type: AuthStateType.LOGGING_IN, isExchangingToken: false}
      // Note: dashboardContext from the callback URL can be set later in handleAuthCallback too
    } else if (token && !isInDashboard) {
      // Only use token from storage if NOT running in dashboard
      authState = {type: AuthStateType.LOGGED_IN, token, currentUser: null}
    } else {
      // Default to logged out if no provided token, not handling callback,
      // or if token exists but we ARE in dashboard mode.
      authState = {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false}
    }

    return {
      authState,
      dashboardContext,
      options: {
        apiHost,
        loginUrl: loginUrl.toString(),
        callbackUrl,
        customProviders,
        providedToken,
        clientFactory,
        initialLocationHref,
        storageKey,
        storageArea,
        authMethod,
      },
    }
  },
  initialize(context) {
    const subscriptions: Subscription[] = []
    subscriptions.push(subscribeToStateAndFetchCurrentUser(context))

    if (context.state.get().options?.storageArea) {
      subscriptions.push(subscribeToStorageEventsAndSetToken(context))
    }

    if (!tokenRefresherRunning) {
      tokenRefresherRunning = true
      subscriptions.push(refreshStampedToken(context))
    }

    return () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
    }
  },
})

/**
 * @public
 */
export const getCurrentUserState = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {authState}}) =>
    authState.type === AuthStateType.LOGGED_IN ? authState.currentUser : null,
  ),
)

/**
 * @public
 */
export const getTokenState = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {authState}}) =>
    authState.type === AuthStateType.LOGGED_IN ? authState.token : null,
  ),
)

/**
 * @internal
 */
export const getAuthMethodState = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {options}}) => options.authMethod),
)

/**
 * @public
 */
export const getLoginUrlState = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {options}}) => options.loginUrl),
)

/**
 * @public
 */
export const getAuthState = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {authState}}) => authState),
)

/**
 * @public
 */
export const getDashboardOrganizationId = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {dashboardContext}}) => dashboardContext?.orgId),
)

/**
 * Returns a state source indicating if the SDK is running within a dashboard context.
 * @public
 */
export const getIsInDashboardState = bindActionGlobally(
  authStore,
  createStateSourceAction(
    ({state: {dashboardContext}}) =>
      // Check if dashboardContext exists and is not empty
      !!dashboardContext && Object.keys(dashboardContext).length > 0,
  ),
)

/**
 * Action to explicitly set the authentication token.
 * Used internally by the Comlink token refresh.
 * @internal
 */
export const setAuthToken = bindActionGlobally(authStore, ({state}, token: string | null) => {
  const currentAuthState = state.get().authState
  if (token) {
    // Update state only if the new token is different or currently logged out
    if (currentAuthState.type !== AuthStateType.LOGGED_IN || currentAuthState.token !== token) {
      // This state update structure should trigger listeners in clientStore
      state.set('setToken', {
        authState: {
          type: AuthStateType.LOGGED_IN,
          token: token,
          // Keep existing user or set to null? Setting to null forces refetch.
          // Keep existing user to avoid unnecessary refetches if user data is still valid.
          currentUser:
            currentAuthState.type === AuthStateType.LOGGED_IN ? currentAuthState.currentUser : null,
        },
      })
    }
  } else {
    // Handle setting token to null (logging out)
    if (currentAuthState.type !== AuthStateType.LOGGED_OUT) {
      state.set('setToken', {
        authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
      })
    }
  }
})
