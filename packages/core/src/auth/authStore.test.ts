import {createClient} from '@sanity/client'
import {EMPTY, of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {type SanityInstance} from '../instance/types'
import {type AuthState, createAuthStore} from './authStore'

/**
 * A mocked request function returned by the mocked `@sanity/client`.
 */
const mockRequest = vi.fn()

/**
 * A mocked observable request function for fetching the current user.
 */
const mockObservableRequest = vi.fn()

// Mock @sanity/client
vi.mock('@sanity/client', () => {
  return {
    createClient: vi.fn((_config) => {
      return {
        request: mockRequest,
        observable: {
          request: mockObservableRequest,
        },
      }
    }),
  }
})

// Mock storage
let mockLocalStorage: Record<string, string> = {}

/**
 * Retrieves an item from the mocked localStorage.
 */
function mockGetItem(key: string) {
  return mockLocalStorage[key] || null
}

/**
 * Sets an item in the mocked localStorage.
 */
function mockSetItem(key: string, value: string) {
  mockLocalStorage[key] = value
}

/**
 * Removes an item from the mocked localStorage.
 */
function mockRemoveItem(key: string) {
  delete mockLocalStorage[key]
}

const mockStorage: Storage = {
  length: 0,
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
  clear: vi.fn(),
  key: vi.fn(),
}

// Mock window and location
let eventListeners: Record<string, ((e: Event) => void)[]> = {}

/**
 * Mocks adding an event listener to the window object.
 */
function mockAddEventListener(type: string, listener: (event: Event) => void) {
  eventListeners[type] = eventListeners[type] || []
  eventListeners[type].push(listener)
}

/**
 * Mocks removing an event listener from the window object.
 */
function mockRemoveEventListener(type: string, listener: (event: Event) => void) {
  eventListeners[type] = (eventListeners[type] || []).filter((l) => l !== listener)
}

/**
 * Mocks dispatching an event on the window object.
 */
function mockDispatchEvent(event: Event) {
  const listeners = eventListeners[event.type] || []
  for (const listener of listeners) {
    listener(event)
  }
  return true
}

vi.stubGlobal('window', {
  addEventListener: mockAddEventListener,
  removeEventListener: mockRemoveEventListener,
  dispatchEvent: mockDispatchEvent,
})
vi.stubGlobal('location', {
  href: 'http://localhost',
})

beforeEach(() => {
  vi.clearAllMocks()
  mockRequest.mockReset()
  mockObservableRequest.mockReset()
  // Default observable request to EMPTY so that if a test doesn't care about user fetching,
  // it will not update currentUser.
  mockObservableRequest.mockReturnValue(EMPTY)

  mockLocalStorage = {}
  eventListeners = {}
  vi.stubGlobal('window', {
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    dispatchEvent: mockDispatchEvent,
  })
  vi.stubGlobal('location', {
    href: 'http://localhost',
  })
})

describe('createAuthStore', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({
      projectId: 'testProject',
      dataset: 'testDataset',
    })
  })

  describe('Initialization states', () => {
    it('initializes logged-out if no token and no callback param', () => {
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent()).toEqual<AuthState>({
        type: 'logged-out',
        isDestroyingSession: false,
      })
    })

    it('initializes logged-in if a static token is provided', () => {
      const store = createAuthStore(instance, {token: 'abc123'})
      expect(store.getCurrent()).toEqual<AuthState>({
        type: 'logged-in',
        token: 'abc123',
        currentUser: null,
      })
    })

    it('initializes logged-in if token found in storage', () => {
      mockSetItem(
        '__sanity_auth_token_testProject_testDataset',
        JSON.stringify({token: 'storedToken'}),
      )
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent()).toEqual<AuthState>({
        type: 'logged-in',
        token: 'storedToken',
        currentUser: null,
      })
    })

    it('initializes logging-in if callback param is present', () => {
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent()).toEqual<AuthState>({type: 'logging-in', isExchangingToken: false})
    })
  })

  describe('handleCallback', () => {
    it('stores token and returns updated URL on successful callback', async () => {
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      mockRequest.mockResolvedValueOnce({token: 'fetchedToken', label: 'Test Label'})
      const store = createAuthStore(instance, {storageArea: mockStorage})
      const result = await store.handleCallback()
      expect(result).toBe('http://localhost/')
      expect(store.getCurrent()).toEqual<AuthState>({
        type: 'logged-in',
        token: 'fetchedToken',
        currentUser: null,
      })
      expect(mockGetItem('__sanity_auth_token_testProject_testDataset')).not.toBe(null)
    })

    it('returns false if no matching location is given', async () => {
      const store = createAuthStore(instance, {storageArea: mockStorage, callbackUrl: '/callback'})
      const result = await store.handleCallback('/not-matching')
      expect(result).toBe(false)
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('sets error state if token fetch fails', async () => {
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      mockRequest.mockRejectedValueOnce(new Error('Token fetch failed'))
      const store = createAuthStore(instance, {storageArea: mockStorage})
      const result = await store.handleCallback()
      expect(result).toBe(false)
      expect(store.getCurrent().type).toBe('error')
    })

    it('immediately returns false if a provided token is present', async () => {
      const store = createAuthStore(instance, {
        storageArea: mockStorage,
        token: 'staticToken',
      })
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      const result = await store.handleCallback()
      expect(result).toBe(false)
      expect(store.getCurrent()).toEqual({
        type: 'logged-in',
        token: 'staticToken',
        currentUser: null,
      })
    })

    it('works with apiHost and org authScope', async () => {
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      mockRequest.mockResolvedValueOnce({token: 'orgToken', label: 'Org Label'})
      const store = createAuthStore(instance, {
        storageArea: mockStorage,
        apiHost: 'https://custom.api.sanity.io',
        authScope: 'org',
      })
      const result = await store.handleCallback()
      expect(result).toBe('http://localhost/')
      expect(store.getCurrent()).toEqual<AuthState>({
        type: 'logged-in',
        token: 'orgToken',
        currentUser: null,
      })
    })

    it('returns false if `handleCallback` is called while already logging in', async () => {
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      mockRequest.mockResolvedValueOnce({token: 'fetchedToken', label: 'Test Label'})
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent()).toEqual({type: 'logging-in', isExchangingToken: false})

      const handleCallbackPromise = store.handleCallback('http://localhost#sid=oauthcode')
      expect(store.getCurrent()).toEqual<AuthState>({type: 'logging-in', isExchangingToken: true})
      await expect(store.handleCallback('http://localhost#sid=oauthcode')).resolves.toBe(false)
      await handleCallbackPromise
      expect(store.getCurrent()).toEqual<AuthState>({
        type: 'logged-in',
        token: 'fetchedToken',
        currentUser: null,
      })
    })
  })

  describe('Current User Fetching', () => {
    it('fetches current user after logging in via handleCallback', async () => {
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      mockRequest.mockResolvedValueOnce({token: 'fetchedToken', label: 'Test Label'})

      // Once logged in, fetch user data
      const fakeUser = {id: 'user123', name: 'Jane Doe'}
      mockObservableRequest.mockReturnValueOnce(of(fakeUser))

      const store = createAuthStore(instance, {storageArea: mockStorage})
      await store.handleCallback()

      // Wait for async subscription updates
      await new Promise((r) => setTimeout(r, 0))

      expect(store.getCurrent()).toEqual({
        type: 'logged-in',
        token: 'fetchedToken',
        currentUser: fakeUser,
      })
    })

    it('fetches current user on initial load if token is in storage', async () => {
      mockSetItem(
        '__sanity_auth_token_testProject_testDataset',
        JSON.stringify({token: 'storedToken'}),
      )

      const fakeUser = {id: 'userABC', name: 'Stored User'}
      mockObservableRequest.mockReturnValueOnce(of(fakeUser))

      const store = createAuthStore(instance, {storageArea: mockStorage})

      // Wait for async subscription updates
      await new Promise((r) => setTimeout(r, 0))

      expect(store.getCurrent()).toEqual({
        type: 'logged-in',
        token: 'storedToken',
        currentUser: fakeUser,
      })
    })
  })

  describe('getLoginUrls', () => {
    it('returns providers with updated URLs', async () => {
      mockRequest.mockResolvedValueOnce({
        providers: [
          {title: 'Provider A', url: 'https://auth.example.com/a'},
          {title: 'Provider B', url: 'https://auth.example.com/b'},
        ],
      })
      const store = createAuthStore(instance, {storageArea: mockStorage})
      const providers = await store.getLoginUrls()
      expect(providers.length).toBe(2)
      expect(providers[0].url).toContain('withSid=true')
      expect(providers[1].url).toContain('withSid=true')
    })

    it('caches the providers and returns synchronously', async () => {
      mockRequest.mockResolvedValueOnce({
        providers: [
          {title: 'Provider A', url: 'https://auth.example.com/a'},
          {title: 'Provider B', url: 'https://auth.example.com/b'},
        ],
      })
      const store = createAuthStore(instance, {storageArea: mockStorage})
      const providers = await store.getLoginUrls()

      expect(providers.length).toBe(2)
      expect(providers[0].url).toContain('withSid=true')
      expect(providers[1].url).toContain('withSid=true')

      const cachedProvidersA = store.getLoginUrls()
      const cachedProvidersB = store.getLoginUrls()

      expect(providers).toBe(cachedProvidersA)
      expect(cachedProvidersA).toBe(cachedProvidersB)
    })

    it('handles providers as a static array and merges/replaces accordingly', async () => {
      mockRequest.mockResolvedValueOnce({
        providers: [
          {title: 'Provider A', name: 'provider-a', url: 'https://auth.example.com/a'},
          {title: 'Provider B', name: 'provider-b', url: 'https://auth.example.com/b'},
        ],
      })

      const store = createAuthStore(instance, {
        storageArea: mockStorage,
        providers: [
          {
            title: 'Custom Provider B',
            name: 'custom-provider-b',
            url: 'https://auth.example.com/b',
          },
          {title: 'Provider C', name: 'provider-c', url: 'https://auth.example.com/c'},
        ],
      })

      const providers = await store.getLoginUrls()
      expect(providers.find((p) => p.title === 'Provider A')).toBeTruthy()
      expect(providers.find((p) => p.title === 'Custom Provider B')).toBeTruthy()
      expect(providers.find((p) => p.title === 'Provider C')).toBeTruthy()
      expect(providers.find((p) => p.title === 'Provider B')).toBeFalsy()
    })

    it('allows custom provider function modification', async () => {
      mockRequest.mockResolvedValueOnce({
        providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
      })

      const store = createAuthStore(instance, {
        storageArea: mockStorage,
        providers: (defaults) => defaults.map((p) => ({...p, title: 'Modified ' + p.title})),
      })

      const providers = await store.getLoginUrls()
      expect(providers[0].title).toBe('Modified Provider A')
    })

    it('uses default providers if none are specified', async () => {
      mockRequest.mockResolvedValueOnce({
        providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
      })

      const store = createAuthStore(instance, {storageArea: mockStorage})
      const providers = await store.getLoginUrls()
      expect(providers.length).toBe(1)
      expect(providers[0].title).toBe('Provider A')
    })

    it('includes callbackUrl in provider URLs if set', async () => {
      mockRequest.mockResolvedValueOnce({
        providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
      })

      const store = createAuthStore(instance, {
        storageArea: mockStorage,
        callbackUrl: 'http://localhost/callback',
      })
      const providers = await store.getLoginUrls()
      expect(providers[0].url).toContain('origin=http%3A%2F%2Flocalhost%2Fcallback')
    })

    it('should allow async custom provider function', async () => {
      mockRequest.mockResolvedValueOnce({
        providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
      })

      const store = createAuthStore(instance, {
        storageArea: mockStorage,
        providers: async (defaults) => {
          await new Promise((r) => setTimeout(r, 10))
          return defaults.concat([
            {title: 'Provider C', name: 'provider-c', url: 'https://auth.example.com/c'},
          ])
        },
      })

      const providers = await store.getLoginUrls()
      expect(providers.length).toBe(2)
      expect(providers.some((p) => p.title === 'Provider C')).toBe(true)
    })
  })

  describe('logout', () => {
    it('removes token from storage and sets state to logged-out', async () => {
      mockSetItem(
        '__sanity_auth_token_testProject_testDataset',
        JSON.stringify({token: 'storedToken'}),
      )
      mockRequest.mockResolvedValueOnce({})
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-in')

      const logoutPromise = store.logout()
      expect(store.getCurrent()).toEqual({type: 'logged-out', isDestroyingSession: true})
      store.logout()
      expect(store.getCurrent()).toEqual({type: 'logged-out', isDestroyingSession: true})

      await logoutPromise
      expect(store.getCurrent()).toEqual({type: 'logged-out', isDestroyingSession: false})
      expect(mockGetItem('__sanity_auth_token_testProject_testDataset')).toBe(null)
      expect(createClient).toHaveBeenCalledTimes(2)
    })

    it('does nothing if not logged-in', async () => {
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')

      await store.logout()
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('does nothing if a static token is provided', async () => {
      const store = createAuthStore(instance, {token: 'staticToken', storageArea: mockStorage})
      expect(store.getCurrent()).toEqual({
        type: 'logged-in',
        token: 'staticToken',
        currentUser: null,
      })

      await store.logout()
      expect(store.getCurrent()).toEqual({
        type: 'logged-in',
        token: 'staticToken',
        currentUser: null,
      })
    })

    it('handles request failure gracefully and still logs out', async () => {
      mockSetItem(
        '__sanity_auth_token_testProject_testDataset',
        JSON.stringify({token: 'failingToken'}),
      )
      mockRequest.mockRejectedValueOnce(new Error('Logout failed'))

      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-in')

      await expect(store.logout()).rejects.toThrow('Logout failed')
      expect(store.getCurrent().type).toBe('logged-out')
      expect(mockGetItem('__sanity_auth_token_testProject_testDataset')).toBe(null)
    })

    it('works gracefully even if no storage is available', async () => {
      mockSetItem('__sanity_auth_token_testProject_testDataset', JSON.stringify({token: 'token'}))
      const store = createAuthStore(instance, {storageArea: undefined})
      expect(store.getCurrent().type).toBe('logged-out')

      await store.logout()
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('transitions to logged-out if no token in storage', async () => {
      const store = createAuthStore(instance, {storageArea: mockStorage})
      await store.logout()
      expect(store.getCurrent().type).toBe('logged-out')
    })
  })

  describe('Subscriptions and events', () => {
    it('subscribe should emit changes in auth state', async () => {
      const store = createAuthStore(instance, {storageArea: mockStorage})
      const states: AuthState[] = []

      const sub = store.subscribe({next: (state) => states.push(state)})
      expect(store.getCurrent().type).toBe('logged-out')

      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      mockRequest.mockResolvedValueOnce({token: 'newToken', label: 'Test'})
      await store.handleCallback()

      expect(states).toEqual([
        {type: 'logged-out', isDestroyingSession: false},
        {type: 'logging-in', isExchangingToken: true},
        // currentUser=null here since we didn't mock observable user fetch, so it remains null.
        {type: 'logged-in', token: 'newToken', currentUser: null},
      ])
      sub.unsubscribe()
    })

    it('dispose should unsubscribe any subscriptions', () => {
      const store = createAuthStore(instance, {storageArea: mockStorage})
      const states: AuthState[] = []
      store.subscribe({next: (state) => states.push(state)})
      store.dispose()

      const evt = {
        type: 'storage',
        key: '__sanity_auth_token_testProject_testDataset',
        newValue: JSON.stringify('newToken'),
        storageArea: mockStorage,
      } as unknown as StorageEvent

      window.dispatchEvent(evt)
      // Subscription should not react after dispose
      expect(states.length).toBeGreaterThan(0) // Only initial emission
      const lastState = states[states.length - 1]
      expect(lastState.type).not.toBe('logged-in')
    })

    it('updates state on matching storage event', async () => {
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')

      const evtKey = '__sanity_auth_token_testProject_testDataset'
      const newToken = 'newTokenFromStorageEvent'
      mockSetItem(evtKey, JSON.stringify({token: newToken}))

      const evt = {
        type: 'storage',
        key: evtKey,
        newValue: JSON.stringify({token: newToken}),
        storageArea: mockStorage,
      } as unknown as StorageEvent

      window.dispatchEvent(evt)
      await new Promise((r) => setTimeout(r, 0))

      expect(store.getCurrent()).toEqual({type: 'logged-in', token: newToken, currentUser: null})
    })

    it('updates state to logged-out when token is removed from storage', async () => {
      const store = createAuthStore(instance, {storageArea: mockStorage})

      // Start with a valid token in storage
      const evtKey = '__sanity_auth_token_testProject_testDataset'
      const token = 'existingToken'
      mockSetItem(evtKey, JSON.stringify({token}))

      // Simulate a storage event to initially set the state to logged-in
      const addTokenEvent = {
        type: 'storage',
        key: evtKey,
        newValue: JSON.stringify({token}),
        storageArea: mockStorage,
      } as unknown as StorageEvent
      window.dispatchEvent(addTokenEvent)

      await new Promise((r) => setTimeout(r, 0))
      expect(store.getCurrent()).toEqual<AuthState>({type: 'logged-in', token, currentUser: null})

      // Now simulate removing the token from storage
      mockRemoveItem(evtKey)
      const removeTokenEvent = {
        type: 'storage',
        key: evtKey,
        newValue: null,
        storageArea: mockStorage,
      } as unknown as StorageEvent
      window.dispatchEvent(removeTokenEvent)

      await new Promise((r) => setTimeout(r, 0))
      expect(store.getCurrent()).toEqual<AuthState>({
        type: 'logged-out',
        isDestroyingSession: false,
      })
    })
  })

  describe('Non-browser and error scenarios', () => {
    it('returns EMPTY observable if not in a browser environment', () => {
      vi.stubGlobal('window', undefined)
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('removes invalid stored token data and stays logged-out if JSON is invalid', () => {
      mockSetItem('__sanity_auth_token_testProject_testDataset', 'not-json')
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')
      expect(mockGetItem('__sanity_auth_token_testProject_testDataset')).toBe(null)
    })

    it('ignores auth code if callbackUrl does not match current location', async () => {
      const store = createAuthStore(instance, {
        storageArea: mockStorage,
        callbackUrl: 'http://otherdomain.com/callback',
      })
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      const result = await store.handleCallback()
      expect(result).toBe(false)
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('covers non-browser environment fully by subscribing to state$', () => {
      vi.stubGlobal('window', undefined)
      const store = createAuthStore(instance, {storageArea: mockStorage})
      const states: AuthState[] = []
      const sub = store.subscribe({next: (state) => states.push(state)})
      expect(states[0].type).toBe('logged-out')
      sub.unsubscribe()
    })

    it('removes invalid stored data if JSON does not contain token field', () => {
      mockSetItem('__sanity_auth_token_testProject_testDataset', JSON.stringify({notToken: 'xxx'}))
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')
      expect(mockGetItem('__sanity_auth_token_testProject_testDataset')).toBe(null)
    })
  })

  describe('createClient calls with apiHost', () => {
    it('handleCallback should call createClient with apiHost if provided', async () => {
      vi.stubGlobal('location', {href: 'http://localhost#sid=oauthcode'})
      mockRequest.mockResolvedValueOnce({token: 'fetchedToken', label: 'Test Label'})

      const apiHost = 'https://custom.api.sanity.io'
      const store = createAuthStore(instance, {storageArea: mockStorage, apiHost})
      await store.handleCallback()
      expect(createClient).toHaveBeenCalledWith(expect.objectContaining({apiHost}))
    })

    it('getLoginUrls should call createClient with apiHost if provided', async () => {
      mockRequest.mockResolvedValueOnce({
        providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
      })

      const apiHost = 'https://custom.api.sanity.io'
      const store = createAuthStore(instance, {storageArea: mockStorage, apiHost})
      await store.getLoginUrls()
      expect(createClient).toHaveBeenCalledWith(expect.objectContaining({apiHost}))
    })

    it('logout should call createClient with apiHost if provided', async () => {
      mockSetItem(
        '__sanity_auth_token_testProject_testDataset',
        JSON.stringify({token: 'storedToken'}),
      )
      mockRequest.mockResolvedValueOnce({})
      const apiHost = 'https://custom.api.sanity.io'
      const store = createAuthStore(instance, {storageArea: mockStorage, apiHost})
      expect(store.getCurrent().type).toBe('logged-in')

      await store.logout()
      expect(createClient).toHaveBeenCalledWith(expect.objectContaining({apiHost}))
    })
  })

  describe('getDefaultLocation and getDefaultStorage error scenarios', () => {
    it('returns DEFAULT_BASE if accessing location.href throws', () => {
      vi.stubGlobal('location', {
        get href() {
          throw new Error('Cannot access location.href')
        },
      })
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('returns DEFAULT_BASE if location is undefined', () => {
      vi.stubGlobal('location', undefined)
      const store = createAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('returns undefined if accessing localStorage throws', async () => {
      const throwingLocalStorage = {}
      Object.defineProperty(throwingLocalStorage, 'getItem', {
        get() {
          throw new Error('Access denied')
        },
      })
      vi.stubGlobal('localStorage', throwingLocalStorage)

      const {createAuthStore: newCreateAuthStore} = await import('./authStore')
      const store = newCreateAuthStore(instance, {})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('returns undefined if localStorage is undefined', () => {
      vi.stubGlobal('localStorage', undefined)
      const store = createAuthStore(instance, {})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('hits the catch block in getDefaultLocation if location.href throws', async () => {
      const throwingLocation = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'href') {
              throw new Error('Simulated location error')
            }
            return undefined
          },
        },
      )
      vi.stubGlobal('location', throwingLocation)
      vi.resetModules()
      const {createAuthStore: newCreateAuthStore} = await import('./authStore')
      const store = newCreateAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('hits the catch block in getDefaultStorage if localStorage throws', async () => {
      const throwingLocalStorage = new Proxy(
        {},
        {
          get() {
            throw new Error('Simulated localStorage error')
          },
        },
      )
      vi.stubGlobal('localStorage', throwingLocalStorage)
      vi.resetModules()
      const {createAuthStore: newCreateAuthStore} = await import('./authStore')
      const store = newCreateAuthStore(instance, {})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('returns undefined if localStorage is defined but getItem is not a function', async () => {
      vi.stubGlobal('localStorage', {})
      vi.resetModules()
      const {createAuthStore: newCreateAuthStore} = await import('./authStore')
      const store = newCreateAuthStore(instance, {})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('returns localStorage if it is defined and getItem is a function', async () => {
      const mockWorkingLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        key: vi.fn(),
        length: 0,
        clear: vi.fn(),
      }
      vi.stubGlobal('localStorage', mockWorkingLocalStorage)
      vi.resetModules()
      const {createAuthStore: newCreateAuthStore} = await import('./authStore')
      const store = newCreateAuthStore(instance, {})
      expect(store.getCurrent().type).toBe('logged-out')
    })

    it('returns DEFAULT_BASE if location is defined but location.href is not a string', async () => {
      vi.stubGlobal('location', {href: 123})
      vi.resetModules()
      const {createAuthStore: newCreateAuthStore} = await import('./authStore')
      const store = newCreateAuthStore(instance, {storageArea: mockStorage})
      expect(store.getCurrent().type).toBe('logged-out')
    })
  })
})
