import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {type Subscription} from 'rxjs'

import {type AuthConfig, type AuthProvider} from '../config/authConfig'
import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore} from '../store/defineStore'
import {createLogger} from '../utils/logger'
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

/**
 * The method of authentication used.
 * @internal
 */
export type AuthMethodOptions = 'localstorage' | 'cookie' | undefined

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
    const logger = createLogger('auth', {
      instanceId: instance.instanceId,
      projectId: instance.config.projectId,
      dataset: instance.config.dataset,
    })

    logger.debug('Initializing auth store', {
      hasProvidedToken: !!instance.config.auth?.token,
      hasCustomProviders: !!(
        instance.config.auth?.providers && instance.config.auth.providers.length > 0
      ),
      studioMode: instance.config.studioMode?.enabled ?? false,
    })

    const {
      apiHost,
      callbackUrl,
      providers: customProviders,
      token: providedToken,
      clientFactory = createClient,
      initialLocationHref = getDefaultLocation(),
    } = instance.config.auth ?? {}
    let storageArea = instance.config.auth?.storageArea

    let storageKey = `__sanity_auth_token`
    const studioModeEnabled = instance.config.studioMode?.enabled

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

    if (!isInDashboard || studioModeEnabled) {
      // If not in dashboard, use the storage area from the config
      // If studio mode is enabled, use the local storage area (default)
      storageArea = storageArea ?? getDefaultStorage()
    }

    let token: string | null
    let authMethod: AuthMethodOptions
    if (studioModeEnabled) {
      // In studio mode, always use the studio-specific storage key and subscribe to it
      const studioStorageKey = `__studio_auth_token_${instance.config.projectId ?? ''}`
      storageKey = studioStorageKey
      token = getStudioTokenFromLocalStorage(storageArea, studioStorageKey)
      if (token) {
        authMethod = 'localstorage'
      }
    } else {
      token = getTokenFromStorage(storageArea, storageKey)
      if (token) {
        authMethod = 'localstorage'
      }
    }

    let authState: AuthState
    if (providedToken) {
      logger.info('Auth initialized with provided token')
      authState = {type: AuthStateType.LOGGED_IN, token: providedToken, currentUser: null}
    } else if (token && studioModeEnabled) {
      logger.info('Auth initialized in Studio mode with token from storage')
      authState = {type: AuthStateType.LOGGED_IN, token: token ?? '', currentUser: null}
    } else if (
      getAuthCode(callbackUrl, initialLocationHref) ||
      getTokenFromLocation(initialLocationHref)
    ) {
      logger.info('Auth callback detected, preparing to exchange token')
      authState = {type: AuthStateType.LOGGING_IN, isExchangingToken: false}
      // Note: dashboardContext from the callback URL can be set later in handleAuthCallback too
    } else if (token && !isInDashboard && !studioModeEnabled) {
      // Only use token from storage if NOT running in dashboard and studio mode is not enabled
      logger.info('Auth initialized with token from storage')
      authState = {type: AuthStateType.LOGGED_IN, token, currentUser: null}
    } else {
      // Default to logged out if no provided token, not handling callback,
      // or if token exists but we ARE in dashboard mode.
      logger.info('Auth initialized in logged out state', {
        isInDashboard,
        hasToken: !!token,
        studioMode: studioModeEnabled,
      })
      authState = {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false}
    }

    logger.debug('Auth state initialized', {
      authStateType: authState.type,
      isInDashboard,
      authMethod,
    })

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
    const {instance} = context
    const logger = createLogger('auth', {
      instanceId: instance.instanceId,
      projectId: instance.config.projectId,
      dataset: instance.config.dataset,
    })

    logger.debug('Setting up auth subscriptions')

    const subscriptions: Subscription[] = []
    subscriptions.push(subscribeToStateAndFetchCurrentUser(context))
    const storageArea = context.state.get().options?.storageArea
    if (storageArea) {
      subscriptions.push(subscribeToStorageEventsAndSetToken(context))
    }

    // If in Studio mode with no local token, resolve cookie auth asynchronously
    try {
      const {state} = context
      const studioModeEnabled = !!instance.config.studioMode?.enabled
      const token: string | null =
        state.get().authState?.type === AuthStateType.LOGGED_IN
          ? (state.get().authState as LoggedInAuthState).token
          : null
      if (studioModeEnabled && !token) {
        logger.debug('Checking for cookie-based authentication in Studio mode')
        const projectId = instance.config.projectId
        const clientFactory = state.get().options.clientFactory
        checkForCookieAuth(projectId, clientFactory).then((isCookieAuthEnabled) => {
          if (!isCookieAuthEnabled) {
            logger.debug('Cookie authentication not available')
            return
          }
          logger.info('Cookie authentication enabled')
          state.set('enableCookieAuth', (prev) => ({
            options: {...prev.options, authMethod: 'cookie'},
            authState:
              prev.authState.type === AuthStateType.LOGGED_IN
                ? prev.authState
                : {type: AuthStateType.LOGGED_IN, token: '', currentUser: null},
          }))
        })
      }
    } catch (error) {
      // best-effort cookie detection
      logger.debug('Cookie authentication check failed', {error})
    }

    if (!tokenRefresherRunning) {
      tokenRefresherRunning = true
      subscriptions.push(refreshStampedToken(context))
    }

    return () => {
      logger.debug('Cleaning up auth subscriptions')
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
export const setAuthToken = bindActionGlobally(
  authStore,
  ({state, instance}, token: string | null) => {
    const logger = createLogger('auth', {
      instanceId: instance.instanceId,
      projectId: instance.config.projectId,
      dataset: instance.config.dataset,
    })

    const currentAuthState = state.get().authState
    if (token) {
      // Update state only if the new token is different or currently logged out
      if (currentAuthState.type !== AuthStateType.LOGGED_IN || currentAuthState.token !== token) {
        logger.info('Setting auth token')
        // This state update structure should trigger listeners in clientStore
        state.set('setToken', {
          authState: {
            type: AuthStateType.LOGGED_IN,
            token: token,
            // Keep existing user or set to null? Setting to null forces refetch.
            // Keep existing user to avoid unnecessary refetches if user data is still valid.
            currentUser:
              currentAuthState.type === AuthStateType.LOGGED_IN
                ? currentAuthState.currentUser
                : null,
          },
        })
      }
    } else {
      // Handle setting token to null (logging out)
      if (currentAuthState.type !== AuthStateType.LOGGED_OUT) {
        logger.info('Clearing auth token')
        state.set('setToken', {
          authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
        })
      }
    }
  },
)
