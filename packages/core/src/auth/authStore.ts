import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {type Subscription} from 'rxjs'

import {type AuthConfig, type AuthProvider} from '../config/authConfig'
import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore} from '../store/defineStore'
import {AuthStateType} from './authStateType'
import {refreshStampedToken} from './refreshStampedToken'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getAuthCode, getDefaultLocation, getDefaultStorage, getTokenFromStorage} from './utils'

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
    callbackUrl: string | undefined
    providedToken: string | undefined
  }
  dashboardContext?: DashboardContext
}

export const authStore = defineStore<AuthStoreState>({
  name: 'Auth',
  isShared: true,
  getInitialState(instance) {
    const {
      apiHost,
      callbackUrl,
      providers: customProviders,
      token: providedToken,
      clientFactory = createClient,
      initialLocationHref = getDefaultLocation(),
      storageArea = getDefaultStorage(),
    } = instance.config.auth ?? {}

    const storageKey = `__sanity_auth_token`

    let authState: AuthState

    const token = getTokenFromStorage(storageArea, storageKey)

    if (providedToken) {
      authState = {type: AuthStateType.LOGGED_IN, token: providedToken, currentUser: null}
    } else if (getAuthCode(callbackUrl, initialLocationHref)) {
      authState = {type: AuthStateType.LOGGING_IN, isExchangingToken: false}
    } else if (token) {
      authState = {type: AuthStateType.LOGGED_IN, token, currentUser: null}
    } else {
      authState = {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false}
    }

    return {
      authState,
      options: {
        apiHost,
        callbackUrl,
        customProviders,
        providedToken,
        clientFactory,
        initialLocationHref,
        storageKey,
        storageArea,
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
 * @public
 */
export const getLoginUrlsState = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {providers}}) => providers ?? null),
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
