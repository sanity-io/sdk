import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'

import {type AuthConfig, type AuthProvider} from '../config/authConfig'
import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore} from '../store/defineStore'
import {resolveAuthMode} from './authMode'
import {AuthStateType} from './authStateType'
import {type AuthStrategyOptions} from './authStrategy'
import {getDashboardInitialState, initializeDashboardAuth} from './dashboardAuth'
import {getStandaloneInitialState, initializeStandaloneAuth} from './standaloneAuth'
import {getStudioInitialState, initializeStudioAuth} from './studioAuth'
import {getCleanedUrl, getDefaultLocation} from './utils'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Store definition — thin orchestrator
// ---------------------------------------------------------------------------

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

    const authConfig = instance.config.auth ?? {}

    // Build login URL (used by standalone mode, but always computed for the
    // public `getLoginUrlState` accessor)
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

    // Resolve auth mode and delegate to the appropriate strategy
    const mode = resolveAuthMode(instance.config, initialLocationHref)

    const strategyOptions: AuthStrategyOptions = {
      authConfig,
      projectId: instance.config.projectId,
      initialLocationHref,
      clientFactory,
      tokenSource: instance.config.studio?.auth?.token,
    }

    let result
    switch (mode) {
      case 'studio':
        result = getStudioInitialState(strategyOptions)
        break
      case 'dashboard':
        result = getDashboardInitialState(strategyOptions)
        break
      case 'standalone':
        result = getStandaloneInitialState(strategyOptions)
        break
    }

    return {
      authState: result.authState,
      dashboardContext: result.dashboardContext,
      options: {
        apiHost,
        loginUrl: loginUrl.toString(),
        callbackUrl,
        customProviders,
        providedToken,
        clientFactory,
        initialLocationHref,
        storageKey: result.storageKey,
        storageArea: result.storageArea,
        authMethod: result.authMethod,
      },
    }
  },

  initialize(context) {
    const initialLocationHref =
      context.state.get().options?.initialLocationHref ?? getDefaultLocation()
    const mode = resolveAuthMode(context.instance.config, initialLocationHref)

    let initResult
    switch (mode) {
      case 'studio':
        initResult = initializeStudioAuth(context, tokenRefresherRunning)
        break
      case 'dashboard':
        initResult = initializeDashboardAuth(context, tokenRefresherRunning)
        break
      case 'standalone':
        initResult = initializeStandaloneAuth(context, tokenRefresherRunning)
        break
    }

    if (initResult.tokenRefresherStarted) {
      tokenRefresherRunning = true
    }

    return initResult.dispose
  },
})

// ---------------------------------------------------------------------------
// Public bound actions
// ---------------------------------------------------------------------------

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
