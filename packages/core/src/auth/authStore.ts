import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {isEqual} from 'lodash-es'
import {
  distinctUntilChanged,
  EMPTY,
  filter,
  fromEvent,
  map,
  Observable,
  type Subscribable,
} from 'rxjs'
import {devtools} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

import type {SanityInstance} from '../instance/types'
import type {AuthProvider} from './authProviders'

const AUTH_CODE_PARAM = 'sid'
const DEFAULT_BASE = 'http://localhost'
const DEFAULT_API_VERSION = '2021-06-07'
const REQUEST_TAG_PREFIX = 'sdk.auth'

/**
 * Represents the various states the authentication store can be in.
 *
 * @public
 */
export type AuthState =
  | {type: 'logged-in'; token: string}
  | {type: 'logging-in'; isExchangingToken: boolean}
  | {type: 'error'; error: unknown}
  | {type: 'logged-out'; isDestroyingSession: boolean}

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
   * If set to 'org', requests are scoped to the organization-level.
   * Defaults to 'project'.
   */
  authScope?: 'project' | 'org'
}

/**
 * Represents an authentication store that can handle login/logout flows, fetch providers,
 * handle auth callbacks, subscribe to state changes, and more.
 *
 * @public
 */
export interface AuthStore extends Subscribable<AuthState> {
  /**
   * Handles an OAuth callback by reading the `sid` parameter from the given `locationHref`.
   * If a token is successfully fetched, the state transitions to `logged-in`.
   *
   * @param locationHref - The location to parse for callback parameters. Defaults to current location.
   * @returns A promise resolving to the updated URL (with callback params removed) or `false` if no callback was handled.
   */
  handleCallback(locationHref?: string): Promise<string | false>

  /**
   * Fetches authentication providers (OAuth endpoints) for logging in.
   * Can optionally be customized with `providers` in {@link AuthConfig}.
   * Results are cached after the first call. Subsequent calls return synchronously from cache.
   *
   * @returns Authentication providers as {@link AuthProvider} objects with pre-configured login URLs.
   */
  getLoginUrls(): AuthProvider[] | Promise<AuthProvider[]>

  /**
   * Logs out the current user. If a static token was provided, logout is a no-op.
   * Otherwise, sends a request to invalidate the current token and updates state to `logged-out`.
   */
  logout(): Promise<void>

  /**
   * Retrieves the current authentication state.
   *
   * @returns The current {@link AuthState}.
   */
  getCurrent(): AuthState

  /**
   * Disposes of any internal resources and subscriptions used by the store.
   * After calling dispose, the store should no longer be used.
   */
  dispose(): void
}

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

/**
 * Creates an observable stream of storage events. If not in a browser environment,
 * returns an EMPTY observable.
 */
function getStorageEvents(): Observable<StorageEvent> {
  const isBrowser = typeof window !== 'undefined' && typeof window.addEventListener === 'function'

  if (!isBrowser) {
    return EMPTY
  }

  return fromEvent<StorageEvent>(window, 'storage')
}

/**
 * Creates a new authentication store for managing OAuth flows, tokens, and related state.
 *
 * @param instance - The Sanity instance configuration.
 * @param config - The auth configuration options.
 * @returns An {@link AuthStore} instance.
 *
 * @public
 */
export function createAuthStore(instance: SanityInstance, config: AuthConfig = {}): AuthStore {
  const {
    clientFactory = createClient,
    initialLocationHref = getDefaultLocation(),
    storageArea = getDefaultStorage(),
    authScope = 'project',
    apiHost,
    callbackUrl,
    providers: customProviders,
    token: providedToken,
  } = config

  const {projectId, dataset} = instance.identity
  const storageKey = `__sanity_auth_token_${projectId}_${dataset}`

  const store = createStore<{authState: AuthState; providers: AuthProvider[] | undefined}>()(
    devtools((..._unusedArgs) => ({authState: getInitialState(), providers: undefined}), {
      name: 'SanityAuthStore',
      // TODO: Consider enabling only in development environment
      enabled: true,
    }),
  )

  const storageSubscription = getStorageEvents()
    .pipe(
      filter(
        (e): e is StorageEvent & {newValue: string} =>
          e.storageArea === storageArea && e.key === storageKey,
      ),
      map(() => getTokenFromStorage()),
      distinctUntilChanged(),
    )
    .subscribe((token) =>
      store.setState(
        {
          authState: token
            ? {type: 'logged-in', token}
            : {type: 'logged-out', isDestroyingSession: false},
        },
        undefined,
        'tokenSetFromStorageEvent',
      ),
    )

  const state$ = new Observable<AuthState>((observer) => {
    observer.next(store.getState().authState)

    store.subscribe(({authState}) => {
      observer.next(authState)
    })
  }).pipe(distinctUntilChanged<AuthState>(isEqual))

  const subscribe = state$.subscribe.bind(state$)
  const getCurrent = () => store.getState().authState

  /**
   * Attempts to retrieve a token from the configured storage.
   * If invalid or not present, returns null.
   */
  function getTokenFromStorage() {
    if (!storageArea) return null
    const item = storageArea.getItem(storageKey)
    if (item === null) return null

    try {
      const parsed: unknown = JSON.parse(item)
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('token' in parsed) ||
        typeof parsed.token !== 'string'
      ) {
        throw new Error('Invalid stored auth data structure')
      }
      return parsed.token
    } catch {
      storageArea.removeItem(storageKey)
      return null
    }
  }

  /**
   * Extracts the auth code (`sid`) from a location, if it matches the callback URL conditions.
   * Returns null if no valid code is found.
   */
  function getAuthCode(locationHref: string) {
    const loc = new URL(locationHref, DEFAULT_BASE)
    const callbackLocation = callbackUrl ? new URL(callbackUrl, DEFAULT_BASE) : undefined
    const callbackLocationMatches = callbackLocation
      ? loc.pathname.toLowerCase().startsWith(callbackLocation.pathname.toLowerCase())
      : true

    const authCode = new URLSearchParams(loc.hash.slice(1)).get(AUTH_CODE_PARAM)
    return authCode && callbackLocationMatches ? authCode : null
  }

  /**
   * Determines the initial auth state based on provided token, callback params, or stored token.
   */
  function getInitialState(): AuthState {
    if (providedToken) return {type: 'logged-in', token: providedToken}
    if (getAuthCode(initialLocationHref)) return {type: 'logging-in', isExchangingToken: false}
    const token = getTokenFromStorage()
    if (token) return {type: 'logged-in', token}
    return {type: 'logged-out', isDestroyingSession: false}
  }

  async function handleCallback(locationHref = getDefaultLocation()) {
    // If a token is provided, no need to handle callback
    if (providedToken) return false

    // Don't handle the callback if already in flight.
    const {authState} = store.getState()
    if (authState.type === 'logging-in' && authState.isExchangingToken) return false

    // If there is no matching `authCode` then we can't handle the callback
    const authCode = getAuthCode(locationHref)
    if (!authCode) return false

    // Otherwise, start the exchange
    store.setState(
      {authState: {type: 'logging-in', isExchangingToken: true}},
      undefined,
      'exchangeSessionForToken',
    )

    try {
      const client = clientFactory({
        projectId,
        dataset,
        apiVersion: DEFAULT_API_VERSION,
        requestTagPrefix: REQUEST_TAG_PREFIX,
        useProjectHostname: authScope === 'project',
        ...(apiHost && {apiHost}),
      })

      const {token} = await client.request<{token: string; label: string}>({
        method: 'GET',
        uri: '/auth/fetch',
        query: {sid: authCode},
        tag: 'fetch-token',
      })

      storageArea?.setItem(storageKey, JSON.stringify({token}))
      store.setState({authState: {type: 'logged-in', token}})

      const loc = new URL(locationHref)
      loc.hash = ''
      return loc.toString()
    } catch (error) {
      store.setState({authState: {type: 'error', error}}, undefined, 'exchangeSessionForTokenError')
      return false
    }
  }

  /**
   * Fetches the providers from `/auth/providers`, adds params to each url, and
   * caches the result for synchronous usage.
   */
  async function fetchLoginUrls() {
    const client = clientFactory({
      projectId,
      dataset,
      apiVersion: DEFAULT_API_VERSION,
      requestTagPrefix: REQUEST_TAG_PREFIX,
      useProjectHostname: authScope === 'project',
      ...(apiHost && {apiHost}),
    })

    const {providers: defaultProviders} = await client.request<{providers: AuthProvider[]}>({
      uri: '/auth/providers',
      tag: 'fetch-providers',
    })

    let providers: AuthProvider[]

    if (typeof customProviders === 'function') {
      providers = await customProviders(defaultProviders)
    } else if (!customProviders?.length) {
      providers = defaultProviders
    } else {
      const customProviderUrls = new Set(customProviders.map((p) => p.url))
      providers = defaultProviders
        .filter((official) => !customProviderUrls.has(official.url))
        .concat(customProviders)
    }

    const configuredProviders = providers.map((provider) => {
      const url = new URL(provider.url)
      const origin = callbackUrl
        ? new URL(callbackUrl, new URL(getDefaultLocation()).origin).toString()
        : getDefaultLocation()

      url.searchParams.set('origin', origin)
      url.searchParams.set('withSid', 'true')
      if (authScope === 'project') {
        url.searchParams.set('projectId', projectId)
      }

      return {...provider, url: url.toString()}
    })

    store.setState({providers: configuredProviders}, undefined, 'fetchedLoginUrls')

    return configuredProviders
  }

  function getLoginUrls() {
    const {providers: cachedProviders} = store.getState()
    if (cachedProviders) return cachedProviders

    return fetchLoginUrls()
  }

  async function logout() {
    // If a token is statically provided, logout does nothing
    if (providedToken) return

    const {authState} = store.getState()

    // If we already have an inflight request, no-op
    if (authState.type === 'logged-out' && authState.isDestroyingSession) return
    const token = authState.type === 'logged-in' && authState.token

    try {
      if (token) {
        store.setState(
          {authState: {type: 'logged-out', isDestroyingSession: true}},
          undefined,
          'loggingOut',
        )

        const client = clientFactory({
          token,
          projectId,
          dataset,
          requestTagPrefix: REQUEST_TAG_PREFIX,
          apiVersion: DEFAULT_API_VERSION,
          useProjectHostname: authScope === 'project',
          ...(apiHost && {apiHost}),
        })

        await client.request<void>({uri: '/auth/logout', method: 'POST'})
      }
    } finally {
      store.setState(
        {authState: {type: 'logged-out', isDestroyingSession: false}},
        undefined,
        'logoutSuccess',
      )
      storageArea?.removeItem(storageKey)
    }
  }

  function dispose() {
    storageSubscription.unsubscribe()
  }

  return {subscribe, getCurrent, handleCallback, getLoginUrls, logout, dispose}
}
