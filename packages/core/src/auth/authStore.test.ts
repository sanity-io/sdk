import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {NEVER, type Subscription} from 'rxjs'
import {afterEach, beforeEach, describe, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {AuthStateType} from './authStateType'
import {
  authStore,
  getAuthState,
  getCurrentUserState,
  getDashboardOrganizationId,
  getLoginUrlState,
  getTokenState,
} from './authStore'
import {handleAuthCallback} from './handleAuthCallback'
import {checkForCookieAuth, getStudioTokenFromLocalStorage} from './studioModeAuth'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getAuthCode, getTokenFromLocation, getTokenFromStorage} from './utils'

vi.mock('./utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./utils')>()
  return {
    ...original,
    getAuthCode: vi.fn(),
    getTokenFromStorage: vi.fn(),
    getTokenFromLocation: vi.fn(),
  }
})

vi.mock('./studioModeAuth', async (importOriginal) => {
  const original = await importOriginal<typeof import('./studioModeAuth')>()
  return {
    ...original,
    getStudioTokenFromLocalStorage: vi.fn(),
    checkForCookieAuth: vi.fn(),
  }
})

vi.mock('./subscribeToStateAndFetchCurrentUser')
vi.mock('./subscribeToStorageEventsAndSetToken')

describe('authStore', () => {
  // Global beforeEach and afterEach for all tests
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(subscribeToStateAndFetchCurrentUser).mockImplementation(() => NEVER.subscribe())
    vi.mocked(subscribeToStorageEventsAndSetToken).mockImplementation(() => NEVER.subscribe())
    vi.mocked(getStudioTokenFromLocalStorage).mockReturnValue(null)
    vi.mocked(checkForCookieAuth).mockResolvedValue(false)
    vi.mocked(getTokenFromStorage).mockReturnValue(null)
    vi.mocked(getAuthCode).mockReturnValue(null)
  })

  describe('getInitialState', () => {
    let instance: ReturnType<typeof createSanityInstance>
    const storageKey = '__sanity_auth_token'

    beforeEach(() => {
      vi.mocked(getTokenFromStorage).mockReturnValue(null)
      vi.mocked(getAuthCode).mockReturnValue(null)
      vi.mocked(getTokenFromLocation).mockReturnValue(null)
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('sets initial options onto state', () => {
      const apiHost = 'test-api-host'
      const callbackUrl = '/login/callback'
      const providers = [
        {name: 'test-provider', id: 'test', title: 'Test', url: 'https://example.com'},
      ]
      const token = 'provided-token'
      const clientFactory = (config: ClientConfig) => createClient(config)
      const initialLocationHref = 'https://example.com'
      const storageArea = {} as Storage

      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {
          apiHost,
          callbackUrl,
          providers,
          token,
          clientFactory,
          initialLocationHref,
          storageArea,
        },
      })

      const {options, dashboardContext} = authStore.getInitialState(instance)

      expect(options.apiHost).toBe(apiHost)
      expect(options.callbackUrl).toBe(callbackUrl)
      expect(options.customProviders).toBe(providers)
      expect(options.providedToken).toBe(token)
      expect(options.clientFactory).toBe(clientFactory)
      expect(options.initialLocationHref).toBe(initialLocationHref)
      expect(options.storageKey).toBe(storageKey)
      expect(options.storageArea).toBe(storageArea)
      expect(dashboardContext).toStrictEqual({})
    })

    it('parses dashboardContext from initialLocationHref', () => {
      const context = {mode: 'test', env: 'staging', orgId: 'abc'}
      const initialLocationHref = `https://example.com/?_context=${encodeURIComponent(JSON.stringify(context))}`
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {initialLocationHref},
      })

      const {dashboardContext, authState} = authStore.getInitialState(instance)
      expect(dashboardContext).toEqual(context)
      expect(authState.type).toBe(AuthStateType.LOGGED_OUT)
    })

    it('parses dashboardContext and removes sid property', () => {
      const context = {mode: 'test', env: 'staging', orgId: 'abc', sid: 'ignore-me'}
      const expectedContext = {mode: 'test', env: 'staging', orgId: 'abc'}
      const initialLocationHref = `https://example.com/?_context=${encodeURIComponent(JSON.stringify(context))}`
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {initialLocationHref},
      })

      const {dashboardContext, authState} = authStore.getInitialState(instance)
      expect(dashboardContext).toEqual(expectedContext)
      expect(authState.type).toBe(AuthStateType.LOGGED_OUT)
    })

    it('handles invalid JSON in _context gracefully', () => {
      const initialLocationHref = `https://example.com/?_context=invalid-json`
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {initialLocationHref},
      })

      const {dashboardContext, authState} = authStore.getInitialState(instance)
      expect(dashboardContext).toStrictEqual({})
      expect(authState.type).toBe(AuthStateType.LOGGED_OUT)
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to parse dashboard context from initial location:',
        expect.any(Error),
      )
      errorSpy.mockRestore()
    })

    it('sets to logged in if provided token is present (even in dashboard)', () => {
      const token = 'provided-token'
      const context = {mode: 'dashboard'}
      const initialLocationHref = `https://example.com/?_context=${encodeURIComponent(JSON.stringify(context))}`
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {
          token,
          initialLocationHref,
        },
      })

      const {authState, dashboardContext} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_IN, token})
      expect(dashboardContext).toEqual(context)
    })

    it('sets to logging in if `getAuthCode` returns a code (even in dashboard)', () => {
      const context = {orgId: 'org1'}
      const initialLocationHref = `https://example.com/?_context=${encodeURIComponent(JSON.stringify(context))}`
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {initialLocationHref},
      })

      vi.mocked(getAuthCode).mockReturnValue('auth-code')

      const {authState, dashboardContext} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGING_IN})
      expect(dashboardContext).toEqual(context)
    })

    it('sets to logged in from storage token when NOT in dashboard', () => {
      const storageToken = 'storage-token'
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
      })

      vi.mocked(getAuthCode).mockReturnValue(null)
      vi.mocked(getTokenFromStorage).mockReturnValue(storageToken)

      const {authState, dashboardContext} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_IN, token: storageToken})
      expect(dashboardContext).toStrictEqual({})
    })

    it('sets to logged out (ignores storage token) when IN dashboard', () => {
      const storageToken = 'storage-token'
      const context = {mode: 'dashboard'}
      const initialLocationHref = `https://example.com/?_context=${encodeURIComponent(JSON.stringify(context))}`
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {initialLocationHref},
      })

      vi.mocked(getAuthCode).mockReturnValue(null)
      vi.mocked(getTokenFromStorage).mockReturnValue(storageToken)

      const {authState, dashboardContext} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_OUT})
      expect(dashboardContext).toEqual(context)
    })

    it('sets the state to logged out when no token, code, or context', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
      })

      vi.mocked(getAuthCode).mockReturnValue(null)
      vi.mocked(getTokenFromStorage).mockReturnValue(null)

      const {authState, dashboardContext} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_OUT})
      expect(dashboardContext).toStrictEqual({})
    })

    it('sets to logged in using studio token when studio mode is enabled and token exists', () => {
      const studioToken = 'studio-token'
      const projectId = 'studio-project'
      const mockStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      } as unknown as Storage // Mock storage
      vi.mocked(getStudioTokenFromLocalStorage).mockReturnValue(studioToken)

      instance = createSanityInstance({
        projectId,
        dataset: 'd',
        studioMode: {enabled: true},
        auth: {storageArea: mockStorage}, // Provide mock storage
      })

      const {authState, options} = authStore.getInitialState(instance)
      expect(getStudioTokenFromLocalStorage).toHaveBeenCalledWith(mockStorage, projectId)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_IN, token: studioToken})
      expect(options.authMethod).toBe('localstorage')
    })

    it('checks for cookie auth when studio mode is enabled and no studio token exists', async () => {
      vi.useFakeTimers()
      const projectId = 'studio-project'
      const mockStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      } as unknown as Storage // Mock storage
      vi.mocked(getStudioTokenFromLocalStorage).mockReturnValue(null)
      // Mock cookie check to return true asynchronously
      vi.mocked(checkForCookieAuth).mockResolvedValue(true)

      instance = createSanityInstance({
        projectId,
        dataset: 'd',
        studioMode: {enabled: true},
        auth: {storageArea: mockStorage}, // Provide mock storage
      })

      // Initial state might be logged out before the async check completes
      const {authState: initialAuthState} = authStore.getInitialState(instance)
      expect(initialAuthState.type).toBe(AuthStateType.LOGGED_OUT) // Or potentially logging in depending on other factors
      expect(getStudioTokenFromLocalStorage).toHaveBeenCalledWith(mockStorage, projectId)
      expect(checkForCookieAuth).toHaveBeenCalledWith(projectId, expect.any(Function))

      // Wait for the promise in getInitialState to resolve
      await vi.runAllTimersAsync()

      vi.useRealTimers()
    })

    it('falls back to default auth (storage token) when studio mode is disabled', () => {
      const storageToken = 'regular-storage-token'
      vi.mocked(getTokenFromStorage).mockReturnValue(storageToken)

      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
      })

      const {authState, options} = authStore.getInitialState(instance)
      expect(getStudioTokenFromLocalStorage).not.toHaveBeenCalled()
      expect(checkForCookieAuth).not.toHaveBeenCalled()
      expect(getTokenFromStorage).toHaveBeenCalled()
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_IN, token: storageToken})
      expect(options.authMethod).toBe('localstorage')
    })
    it('sets to logging in if getTokenFromLocation returns a token', () => {
      const initialLocationHref = 'https://example.com/#token=hash-token'
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {initialLocationHref},
      })

      vi.mocked(getAuthCode).mockReturnValue(null)
      vi.mocked(getTokenFromLocation).mockReturnValue('hash-token')

      const {authState} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({
        type: AuthStateType.LOGGING_IN,
        isExchangingToken: false,
      })
      expect(getTokenFromLocation).toHaveBeenCalledWith(initialLocationHref)
    })
  })

  describe('initialize', () => {
    let mockLocalStorage: Storage
    let instance: ReturnType<typeof createSanityInstance>
    let stateUnsubscribe: ReturnType<typeof vi.fn>
    let storageEventsUnsubscribe: ReturnType<typeof vi.fn>

    beforeEach(() => {
      // Create fresh mock localStorage for each test
      mockLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
        // Define getter to match real Storage objects
        get constructor() {
          return Storage
        },
      } as unknown as Storage

      stateUnsubscribe = vi.fn()
      storageEventsUnsubscribe = vi.fn()

      vi.mocked(subscribeToStateAndFetchCurrentUser).mockReturnValue({
        unsubscribe: stateUnsubscribe,
      } as unknown as Subscription)

      vi.mocked(subscribeToStorageEventsAndSetToken).mockReturnValue({
        unsubscribe: storageEventsUnsubscribe,
      } as unknown as Subscription)
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('subscribes to state and storage events and unsubscribes on dispose', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {storageArea: mockLocalStorage},
      })

      Object.defineProperty(mockLocalStorage, 'constructor', {
        get: () => Storage,
      })

      expect(subscribeToStateAndFetchCurrentUser).not.toHaveBeenCalled()
      expect(subscribeToStorageEventsAndSetToken).not.toHaveBeenCalled()

      // call a bound action to lazily create the store
      getAuthState(instance)

      expect(subscribeToStateAndFetchCurrentUser).toHaveBeenCalled()
      expect(subscribeToStorageEventsAndSetToken).toHaveBeenCalled()

      instance.dispose()

      expect(stateUnsubscribe).toHaveBeenCalled()
      expect(storageEventsUnsubscribe).toHaveBeenCalled()
    })

    it('does not subscribe to storage events when not using storage area', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {storageArea: undefined},
      })

      getAuthState(instance)

      expect(subscribeToStateAndFetchCurrentUser).toHaveBeenCalled()
      expect(subscribeToStorageEventsAndSetToken).not.toHaveBeenCalled()

      instance.dispose()

      expect(stateUnsubscribe).toHaveBeenCalled()
      expect(storageEventsUnsubscribe).not.toHaveBeenCalled()
    })
  })

  describe('getCurrentUserState', () => {
    let instance: ReturnType<typeof createSanityInstance>
    let currentUser: CurrentUser

    beforeEach(() => {
      currentUser = {id: 'example-user'} as CurrentUser
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('returns the current user if logged in and current user is non-null', () => {
      vi.mocked(subscribeToStateAndFetchCurrentUser).mockImplementation(({state}) => {
        state.set('setCurrentUser', {
          authState: {
            type: AuthStateType.LOGGED_IN,
            token: 'token',
            currentUser,
          },
        })

        return NEVER.subscribe()
      })

      instance = createSanityInstance({projectId: 'p', dataset: 'd'})

      const {getCurrent} = getCurrentUserState(instance)

      // pureness check
      expect(getCurrent()).toBe(getCurrent())
    })

    it('returns null otherwise', () => {
      instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      const {getCurrent} = getCurrentUserState(instance)
      expect(getCurrent()).toBe(null)
    })
  })

  describe('getTokenState', () => {
    let instance: ReturnType<typeof createSanityInstance>

    afterEach(() => {
      instance?.dispose()
    })

    it('returns the token if logged in', () => {
      const token = 'hard-coded-token'
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {token},
      })
      const tokenState = getTokenState(instance)
      expect(tokenState.getCurrent()).toBe(token)

      // pureness check
      expect(tokenState.getCurrent()).toBe(tokenState.getCurrent())
    })

    it('returns null otherwise', () => {
      instance = createSanityInstance({projectId: 'p', dataset: 'd'})

      const tokenState = getTokenState(instance)
      expect(tokenState.getCurrent()).toBe(null)

      // pureness check
      expect(tokenState.getCurrent()).toBe(tokenState.getCurrent())
    })
  })

  describe('getLoginUrlsState', () => {
    let instance: ReturnType<typeof createSanityInstance>

    afterEach(() => {
      instance?.dispose()
    })

    it('returns the default login url', () => {
      instance = createSanityInstance({projectId: 'p', dataset: 'd'})

      const loginUrlState = getLoginUrlState(instance)
      expect(loginUrlState.getCurrent()).toBe(
        'https://www.sanity.io/login?origin=http%3A%2F%2Flocalhost%2F&type=stampedToken&withSid=true',
      )
    })
  })

  describe('getAuthState', () => {
    let instance: ReturnType<typeof createSanityInstance>

    afterEach(() => {
      instance?.dispose()
    })

    it('returns the current state in `authState`', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {token: 'hard-coded-token'},
      })

      const {getCurrent} = getAuthState(instance)
      expect(getCurrent()).toEqual({
        currentUser: null,
        token: 'hard-coded-token',
        type: 'logged-in',
      })

      // pureness check
      expect(getCurrent()).toBe(getCurrent())
    })
  })

  describe('getDashboardOrganizationId', () => {
    let instance: ReturnType<typeof createSanityInstance>

    beforeEach(() => {
      vi.mocked(getAuthCode).mockReturnValue('test-auth-code')
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('returns the organization id if present in initial context', () => {
      const context = {orgId: 'initial-org-id'}
      const initialLocationHref = `https://example.com/?_context=${encodeURIComponent(JSON.stringify(context))}`
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {initialLocationHref},
      })

      // No callback needed, check initial state
      const organizationId = getDashboardOrganizationId(instance)
      expect(organizationId.getCurrent()).toBe('initial-org-id')
    })

    it('returns the organization id from callback context if handling callback', async () => {
      const initialContext = {orgId: 'initial-org-id'}
      const initialLocationHref = `https://example.com/?_context=${encodeURIComponent(JSON.stringify(initialContext))}`
      const callbackContext = {orgId: 'callback-org-id', mode: 'test'} // Context from callback URL
      const mockClient = {request: vi.fn().mockResolvedValue({token: 'test-token', label: 'tes'})}
      const authCode = 'test-auth-code'

      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {
          clientFactory: () => mockClient as unknown as SanityClient,
          initialLocationHref, // Set initial context
        },
      })

      // Mock getAuthCode to return a code for the callback URL
      vi.mocked(getAuthCode).mockReturnValue(authCode)

      // Create a callback URL with the different _context and the sid
      const callbackUrl = `https://example.com/login/callback?sid=${authCode}&_context=${encodeURIComponent(JSON.stringify(callbackContext))}`

      // Ensure initial state has initial orgId
      const initialOrgId = getDashboardOrganizationId(instance)
      expect(initialOrgId.getCurrent()).toBe('initial-org-id')

      // Call handleCallback with the callback URL
      await handleAuthCallback(instance, callbackUrl) // Use await as handleAuthCallback is async

      // Wait for the state update to be reflected in the selector
      await vi.waitUntil(
        () => getDashboardOrganizationId(instance).getCurrent() === 'callback-org-id',
      )
      // Add a microtask yield just in case
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Check that the orgId from the callback context is now set
      const finalOrgId = getDashboardOrganizationId(instance)
      expect(finalOrgId.getCurrent()).toBe('callback-org-id')
    })

    it('returns undefined orgId if not present', () => {
      const context = {mode: 'test'} // No orgId
      const initialLocationHref = `https://example.com/?_context=${encodeURIComponent(JSON.stringify(context))}`
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {initialLocationHref},
      })

      const organizationId = getDashboardOrganizationId(instance)
      expect(organizationId.getCurrent()).toBeUndefined()
    })
  })
})
