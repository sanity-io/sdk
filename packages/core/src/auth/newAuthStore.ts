import {createClient, SanityClient, type ClientConfig} from '@sanity/client'
import {createResource} from '../store/createResource'
import type {AuthProvider} from './authStore'
import type {CurrentUser} from '@sanity/types'
import {getAuthCode} from './actions/getAuthCode'
import {getTokenFromStorage} from './actions/getTokenFromStorage'
import {subscribeToStorageEvents} from './actions/subscribeToStorageEvents'
import {subscribeToStoreAndFetchCurrentUser} from './actions/subscribeToStoreAndFetchCurrentUser'

const DEFAULT_BASE = 'http://localhost'

export type AuthState =
  | {type: 'logged-in'; token: string; currentUser: CurrentUser | null}
  | {type: 'logging-in'; isExchangingToken: boolean}
  | {type: 'error'; error: unknown}
  | {type: 'logged-out'; isDestroyingSession: boolean}

/**
 * Returns the default location to use.
 * Tries accessing `location.href`, falls back to a default base if not available or on error.
 */
function getDefaultLocation() {
  try {
    if (typeof location === 'undefined') return DEFAULT_BASE
    if (typeof location.href === 'string') return location.href
    return DEFAULT_BASE
  } catch {
    return DEFAULT_BASE
  }
}

/**
 * Returns a default storage instance (localStorage) if available.
 * If not available or an error occurs, returns undefined.
 */
function getDefaultStorage() {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage
    }
    return undefined
  } catch {
    return undefined
  }
}

interface AuthContext {
  apiHost?: string
  authScope: 'project' | 'org'
  callbackUrl?: string
  clientFactory: (clientConfig: ClientConfig) => SanityClient
  initialLocationHref: string
  customProviders?:
    | AuthProvider[]
    | ((prev: AuthProvider[]) => AuthProvider[] | Promise<AuthProvider[]>)
  storageArea?: Storage
  providedToken?: string
  storageKey: string
  getDefaultLocation: () => string
}

interface InternalAuthState {
  authState: AuthState
  providers: AuthProvider[] | undefined
}

export const Auth = createResource<AuthContext, InternalAuthState>('auth', {
  getContext: ({instance}) => {
    const {config, identity} = instance
    const {
      apiHost,
      authScope = 'project',
      callbackUrl,
      clientFactory = createClient,
      initialLocationHref = getDefaultLocation(),
      providers: customProviders,
      storageArea = getDefaultStorage(),
      token: providedToken,
    } = config.auth ?? {}
    const storageKey = `_sanity_auth_token_${identity.projectId}_${identity.dataset}`

    return {
      apiHost,
      authScope,
      callbackUrl,
      clientFactory,
      initialLocationHref,
      customProviders,
      storageArea,
      providedToken,
      storageKey,
      getDefaultLocation,
    }
  },
  getInitialState: ({context, instance}): InternalAuthState => {
    const {providedToken, initialLocationHref} = context

    const authState = ((): AuthState => {
      if (providedToken) return {type: 'logged-in', token: providedToken, currentUser: null}
      if (getAuthCode(instance, initialLocationHref)) {
        return {type: 'logging-in', isExchangingToken: false}
      }
      const token = getTokenFromStorage(instance)
      if (token) return {type: 'logged-in', token, currentUser: null}
      return {type: 'logged-out', isDestroyingSession: false}
    })()

    return {authState, providers: []}
  },
  initialize: ({instance}) => {
    const storageSubscription = subscribeToStorageEvents(instance)
    const storeSubscription = subscribeToStoreAndFetchCurrentUser(instance)

    return () => {
      storageSubscription.unsubscribe()
      storeSubscription.unsubscribe()
    }
  },
})
