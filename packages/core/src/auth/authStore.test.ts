import {type ClientConfig, createClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {type Subscription} from 'rxjs'
import {beforeEach, describe, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, getOrCreateResource} from '../resources/createResource'
import {AuthStateType} from './authStateType'
import {
  authStore,
  type AuthStoreState,
  getAuthState,
  getCurrentUserState,
  getLoginUrlsState,
  getTokenState,
} from './authStore'
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
  describe('getInitialState', () => {
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

      const instance = createSanityInstance({
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

      vi.mocked(getTokenFromStorage).mockReturnValue(null)

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
      const instance = createSanityInstance({
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
      const instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
      })

      vi.mocked(getAuthCode).mockReturnValue('auth-code')

      const {authState} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGING_IN})
    })

    it('sets to logged in if `getTokenFromStorage` returns a token', () => {
      const instance = createSanityInstance({
        projectId: 'p',
        dataset: 'd',
      })

      vi.mocked(getAuthCode).mockReturnValue(null)
      vi.mocked(getTokenFromStorage).mockReturnValue('new-token')

      const {authState} = authStore.getInitialState(instance)
      expect(authState).toMatchObject({type: AuthStateType.LOGGED_IN, token: 'new-token'})
    })

    it('otherwise it sets the state to logged out', () => {
      const instance = createSanityInstance({
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

    beforeEach(() => {
      vi.clearAllMocks()
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
    })

    it('subscribes to state and storage events and unsubscribes on dispose', () => {
      const instance = createSanityInstance({
        projectId: 'p123abc',
        dataset: 'production',
        auth: {
          storageArea: mockLocalStorage,
        },
      })

      const stateUnsubscribe = vi.fn()
      vi.mocked(subscribeToStateAndFetchCurrentUser).mockReturnValue({
        unsubscribe: stateUnsubscribe,
      } as unknown as Subscription)

      const storageEventsUnsubscribe = vi.fn()
      vi.mocked(subscribeToStorageEventsAndSetToken).mockReturnValue({
        unsubscribe: storageEventsUnsubscribe,
      } as unknown as Subscription)

      Object.defineProperty(mockLocalStorage, 'constructor', {
        get: () => Storage,
      })

      expect(subscribeToStateAndFetchCurrentUser).not.toHaveBeenCalled()
      expect(subscribeToStorageEventsAndSetToken).not.toHaveBeenCalled()

      getOrCreateResource(instance, authStore)

      expect(subscribeToStateAndFetchCurrentUser).toHaveBeenCalled()
      expect(subscribeToStorageEventsAndSetToken).toHaveBeenCalled()

      instance.dispose()

      expect(stateUnsubscribe).toHaveBeenCalled()
      expect(storageEventsUnsubscribe).toHaveBeenCalled()
    })

    it('does not subscribe to storage events when not using storage area', () => {
      const instance = createSanityInstance({
        projectId: 'p123abc',
        dataset: 'production',
        auth: {
          storageArea: undefined,
        },
      })

      const stateUnsubscribe = vi.fn()
      vi.mocked(subscribeToStateAndFetchCurrentUser).mockReturnValue({
        unsubscribe: stateUnsubscribe,
      } as unknown as Subscription)

      const storageEventsUnsubscribe = vi.fn()
      vi.mocked(subscribeToStorageEventsAndSetToken).mockReturnValue({
        unsubscribe: storageEventsUnsubscribe,
      } as unknown as Subscription)

      getOrCreateResource(instance, authStore)

      expect(subscribeToStateAndFetchCurrentUser).toHaveBeenCalled()
      expect(subscribeToStorageEventsAndSetToken).not.toHaveBeenCalled()

      instance.dispose()

      expect(stateUnsubscribe).toHaveBeenCalled()
      expect(storageEventsUnsubscribe).not.toHaveBeenCalled()
    })
  })

  describe('getCurrentUserState', () => {
    it('returns the current user if logged in and current user is non-null', () => {
      const currentUser = {id: 'example-user'} as CurrentUser
      const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      const state = createResourceState<AuthStoreState>({
        authState: {type: AuthStateType.LOGGED_IN, token: 'new-token', currentUser},
      } as AuthStoreState)

      const currentUserState = getCurrentUserState({instance, state})
      expect(currentUserState.getCurrent()).toBe(currentUser)

      // pureness check
      expect(currentUserState.getCurrent()).toBe(currentUserState.getCurrent())
    })

    it('returns null otherwise', () => {
      const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      const state = createResourceState<AuthStoreState>({
        authState: {type: AuthStateType.LOGGED_OUT},
      } as AuthStoreState)

      const currentUserState = getCurrentUserState({instance, state})
      expect(currentUserState.getCurrent()).toBe(null)

      // pureness check
      expect(currentUserState.getCurrent()).toBe(currentUserState.getCurrent())
    })
  })

  describe('getTokenState', () => {
    it('returns the token if logged in', () => {
      const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      const token = 'new-token'
      const state = createResourceState<AuthStoreState>({
        authState: {type: AuthStateType.LOGGED_IN, token},
      } as AuthStoreState)

      const tokenState = getTokenState({instance, state})
      expect(tokenState.getCurrent()).toBe(token)

      // pureness check
      expect(tokenState.getCurrent()).toBe(tokenState.getCurrent())
    })

    it('returns null otherwise', () => {
      const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      const state = createResourceState<AuthStoreState>({
        authState: {type: AuthStateType.ERROR, error: new Error('test error')},
      } as AuthStoreState)

      const tokenState = getTokenState({instance, state})
      expect(tokenState.getCurrent()).toBe(null)

      // pureness check
      expect(tokenState.getCurrent()).toBe(tokenState.getCurrent())
    })
  })

  describe('getLoginUrlsState', () => {
    it('returns the cached auth providers if present', () => {
      const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      const providers = [{name: 'test', title: 'Test', url: 'https://example.com#withSid=true'}]
      const state = createResourceState<AuthStoreState>({providers} as AuthStoreState)

      const loginUrlsState = getLoginUrlsState({instance, state})
      expect(loginUrlsState.getCurrent()).toBe(providers)

      // pureness check
      expect(loginUrlsState.getCurrent()).toBe(loginUrlsState.getCurrent())
    })

    it('returns nulls otherwise', () => {
      const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      const state = createResourceState<AuthStoreState>({} as AuthStoreState)

      const loginUrlsState = getLoginUrlsState({instance, state})
      expect(loginUrlsState.getCurrent()).toBe(null)

      // pureness check
      expect(loginUrlsState.getCurrent()).toBe(loginUrlsState.getCurrent())
    })
  })

  describe('getAuthState', () => {
    it('returns the current state in `authState`', () => {
      const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      const authState: AuthStoreState['authState'] = {
        type: AuthStateType.LOGGED_OUT,
        isDestroyingSession: false,
      }
      const state = createResourceState<AuthStoreState>({authState} as AuthStoreState)

      const authStateSource = getAuthState({instance, state})
      expect(authStateSource.getCurrent()).toBe(authState)

      // pureness check
      expect(authStateSource.getCurrent()).toBe(authStateSource.getCurrent())
    })
  })
})
