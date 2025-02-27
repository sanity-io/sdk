import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'

import {createResource} from '../resources/createResource'
import {createStateSourceAction} from '../resources/createStateSourceAction'
import {AuthStateType} from './authStateType'
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
 * Configuration for an authentication provider
 * @public
 */
export interface AuthProvider {
  /**
   * Unique identifier for the auth provider (e.g., 'google', 'github')
   */
  name: string

  /**
   * Display name for the auth provider in the UI
   */
  title: string

  /**
   * Complete authentication URL including callback and token parameters
   */
  url: string

  /**
   * Optional URL for direct sign-up flow
   */
  signUpUrl?: string
}

/**
 * Configuration options for creating an auth store.
 *
 * @public
 */
export interface AuthConfig {
  /**
   * The initial location href to use when handling auth callbacks.
   * Defaults to the current window location if available.
   */
  initialLocationHref?: string

  /**
   * Factory function to create a SanityClient instance.
   * Defaults to the standard Sanity client factory if not provided.
   */
  clientFactory?: (config: ClientConfig) => SanityClient

  /**
   * Custom authentication providers to use instead of or in addition to the default ones.
   * Can be an array of providers or a function that takes the default providers and returns
   * a modified array or a Promise resolving to one.
   */
  providers?: AuthProvider[] | ((prev: AuthProvider[]) => AuthProvider[] | Promise<AuthProvider[]>)

  /**
   * The API hostname for requests. Usually leave this undefined, but it can be set
   * if using a custom domain or CNAME for the API endpoint.
   */
  apiHost?: string

  /**
   * Storage implementation to persist authentication state.
   * Defaults to `localStorage` if available.
   */
  storageArea?: Storage

  /**
   * A callback URL for your application.
   * If none is provided, the auth API will redirect back to the current location (`location.href`).
   * When handling callbacks, this URL's pathname is checked to ensure it matches the callback.
   */
  callbackUrl?: string

  /**
   * A static authentication token to use instead of handling the OAuth flow.
   * When provided, the auth store will remain in a logged-in state with this token,
   * ignoring any storage or callback handling.
   */
  token?: string

  /**
   * The authentication scope.
   * If set to 'project', requests are scoped to the project-level.
   * If set to 'global', requests are scoped to the user access level.
   * Defaults to 'project'.
   */
  authScope?: 'project' | 'global'
}

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
    authScope: 'project' | 'global'
    storageKey: string
    storageArea: Storage | undefined
    apiHost: string | undefined
    callbackUrl: string | undefined
    providedToken: string | undefined
  }
}

export const authStore = createResource<AuthStoreState>({
  name: 'Auth',
  getInitialState(instance) {
    const {
      apiHost,
      callbackUrl,
      providers: customProviders,
      authScope = 'project',
      token: providedToken,
      clientFactory = createClient,
      initialLocationHref = getDefaultLocation(),
      storageArea = getDefaultStorage(),
    } = instance.config.auth ?? {}

    let storageKey: string
    if (authScope !== 'global') {
      const {projectId, dataset} = instance.resources[0] // TODO: Ryan - this is a hack to get the projectId and dataset
      storageKey = `__sanity_auth_token_${projectId}_${dataset}`
    } else {
      storageKey = `__sanity_auth_token_global`
    }

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
        authScope,
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
  initialize() {
    const stateSubscription = subscribeToStateAndFetchCurrentUser(this)
    const storageEventsSubscription = subscribeToStorageEventsAndSetToken(this)

    return () => {
      stateSubscription.unsubscribe()
      storageEventsSubscription.unsubscribe()
    }
  },
})

/**
 * @public
 */
export const getCurrentUserState = createStateSourceAction(authStore, ({authState}) =>
  authState.type === AuthStateType.LOGGED_IN ? authState.currentUser : null,
)

/**
 * @public
 */
export const getTokenState = createStateSourceAction(authStore, ({authState}) =>
  authState.type === AuthStateType.LOGGED_IN ? authState.token : null,
)
/**
 * @public
 */
export const getLoginUrlsState = createStateSourceAction(
  authStore,
  ({providers}) => providers ?? null,
)

/**
 * @public
 */
export const getAuthState = createStateSourceAction(authStore, ({authState}) => authState)
