import {type ClientConfig, createClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {NEVER, type Subscription} from 'rxjs'
import {afterEach, beforeEach, describe, it} from 'vitest'

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
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getAuthCode, getTokenFromStorage} from './utils'

vi.mock('./utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./utils')>()
  return {...original, getAuthCode: vi.fn(), getTokenFromStorage: vi.fn()}
})

vi.mock('./subscribeToStateAndFetchCurrentUser')
vi.mock('./subscribeToStorageEventsAndSetToken')

describe('authStore', () => {
  // Global beforeEach and afterEach for all tests
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(subscribeToStateAndFetchCurrentUser).mockImplementation(() => NEVER.subscribe())
    vi.mocked(subscribeToStorageEventsAndSetToken).mockImplementation(() => NEVER.subscribe())
  })

  describe('getInitialState', () => {
    let instance: ReturnType<typeof createSanityInstance>

    beforeEach(() => {
      vi.mocked(getTokenFromStorage).mockReturnValue(null)
      vi.mocked(getAuthCode).mockReturnValue(null)
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

      const {options} = authStore.getInitialState(instance)

      expect(options.apiHost).toBe(apiHost)
      expect(options.callbackUrl).toBe(callbackUrl)
      expect(options.customProviders).toBe(providers)
      expect(options.providedToken).toBe(token)
      expect(options.clientFactory).toBe(clientFactory)
      expect(options.initialLocationHref).toBe(initialLocationHref)
      expect(options.storageKey).toBe('__sanity_auth_token')
      expect(options.storageArea).toBe(storageArea)
    })

    it('sets to logged in if provided token is present', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {
          token: 'provided-token',
        },
      })

      const {authState} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_IN})
    })

    it('sets to logging in if `getAuthCode` returns a code', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
      })

      vi.mocked(getAuthCode).mockReturnValue('auth-code')

      const {authState} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGING_IN})
    })

    it('sets to logged in if `getTokenFromStorage` returns a token', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
      })

      vi.mocked(getAuthCode).mockReturnValue(null)
      vi.mocked(getTokenFromStorage).mockReturnValue('new-token')

      const {authState} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_IN, token: 'new-token'})
    })

    it('otherwise it sets the state to logged out', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
      })

      vi.mocked(getAuthCode).mockReturnValue(null)
      vi.mocked(getTokenFromStorage).mockReturnValue(null)

      const {authState} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_OUT})
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
        'https://www.sanity.io/login?origin=http%3A%2F%2Flocalhost&type=stampedToken&withSid=true',
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

    it('returns the organization id if present', () => {
      instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
        auth: {
          clientFactory: vi.fn().mockReturnValue({
            request: vi.fn().mockResolvedValue({token: 'test-token', label: 'tes'}),
          }),
        },
      })

      // Create a URL with an organization ID in the _context parameter
      const callbackUrl = `https://example.com/login/callback?sid=test-auth-code&_context=${encodeURIComponent(JSON.stringify({orgId: 'org-id'}))}`

      // Call handleCallback with the URL to set the organization ID in the state
      handleAuthCallback(instance, callbackUrl)

      const organizationId = getDashboardOrganizationId(instance)
      expect(organizationId.getCurrent()).toBe('org-id')
    })
  })
})
