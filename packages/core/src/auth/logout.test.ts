import {NEVER} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {AuthStateType} from './authStateType'
import {getAuthState} from './authStore'
import {logout} from './logout'
import {getOAuthTokensState, serializeTokens} from './oauth/oauthActions'
import {OAUTH_TOKENS_KEY} from './oauth/oauthAuth'
import {type OAuthTokens} from './oauth/types'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getTokenFromStorage} from './utils'

vi.mock('./utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./utils')>()
  return {...original, getTokenFromStorage: vi.fn()}
})

vi.mock('./subscribeToStateAndFetchCurrentUser')
vi.mock('./subscribeToStorageEventsAndSetToken')

// Mock logger to prevent actual logging during tests
vi.mock('../utils/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/logger')>()
  return {
    ...original,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    })),
  }
})

let instance: SanityInstance | undefined

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(subscribeToStateAndFetchCurrentUser).mockImplementation(() => NEVER.subscribe())
  vi.mocked(subscribeToStorageEventsAndSetToken).mockImplementation(() => NEVER.subscribe())
})

afterEach(() => {
  instance?.dispose()
})

describe('logout', () => {
  it("calls '/auth/logout', sets the state to logged out, and removes any storage items", async () => {
    vi.mocked(getTokenFromStorage).mockReturnValue('token')
    const mockRequest = vi.fn().mockResolvedValue(undefined)
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const removeItem = vi.fn() as Storage['removeItem']

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {removeItem} as Storage,
      },
    })

    const authState = getAuthState(instance)
    expect(authState.getCurrent()).toMatchObject({type: AuthStateType.LOGGED_IN})

    const logoutPromise = logout(instance)
    expect(authState.getCurrent()).toMatchObject({isDestroyingSession: true})
    await logoutPromise
    expect(authState.getCurrent()).toMatchObject({isDestroyingSession: false})

    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      requestTagPrefix: 'sanity.sdk.auth',
      token: 'token',
      useProjectHostname: false,
      useCdn: false,
    })
    expect(mockRequest).toHaveBeenCalledWith({method: 'POST', url: '/auth/logout', tag: 'logout'})
    expect(removeItem).toHaveBeenCalledWith('__sanity_auth_token')
  })

  it('returns early if there is a provided token', async () => {
    const clientFactory = vi.fn()
    const removeItem = vi.fn() as Storage['removeItem']
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        token: 'provided-token',
        clientFactory,
        storageArea: {removeItem} as Storage,
      },
    })

    await logout(instance)

    expect(clientFactory).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('returns early if the session is already destroying', async () => {
    let resolveRequest!: () => void
    const requestPromise = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    const request = vi.fn().mockReturnValue(requestPromise)
    const clientFactory = vi.fn().mockReturnValue({request})
    const removeItem = vi.fn() as Storage['removeItem']
    vi.mocked(getTokenFromStorage).mockReturnValue('token')

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {removeItem} as Storage,
      },
    })

    const authState = getAuthState(instance)
    expect(authState.getCurrent()).toMatchObject({type: AuthStateType.LOGGED_IN})

    const originalLogout = logout(instance)
    expect(authState.getCurrent()).toMatchObject({isDestroyingSession: true})

    // reset counts
    clientFactory.mockClear()
    vi.mocked(removeItem).mockClear()

    await logout(instance) // should early return

    expect(clientFactory).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()

    resolveRequest()

    await originalLogout
    expect(removeItem).toHaveBeenCalledTimes(2)
  })

  it('handles logout when already logged out', async () => {
    vi.mocked(getTokenFromStorage).mockReturnValue(null)
    const mockRequest = vi.fn()
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const removeItem = vi.fn() as Storage['removeItem']

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {removeItem} as Storage,
      },
    })

    const authState = getAuthState(instance)
    expect(authState.getCurrent()).toMatchObject({type: AuthStateType.LOGGED_OUT})

    await logout(instance)

    // Should not make API call when already logged out
    expect(clientFactory).not.toHaveBeenCalled()
    expect(mockRequest).not.toHaveBeenCalled()

    // Should still clean up storage
    expect(removeItem).toHaveBeenCalledWith('__sanity_auth_token')
  })

  it('revokes OAuth tokens instead of calling /auth/logout in OAuth mode', async () => {
    const oauthTokens: OAuthTokens = {
      accessToken: 'oauth-access',
      tokenType: 'bearer',
      expiresIn: 3600,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      refreshToken: 'oauth-refresh',
    }
    const map = new Map<string, string>([[OAUTH_TOKENS_KEY, serializeTokens(oauthTokens)]])
    const storageArea = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    } as Storage

    const mockRequest = vi.fn().mockResolvedValue(undefined)
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea,
        oauth: {
          clientId: 'client-abc',
          redirectUri: 'https://app.example.com/callback',
          organizationId: 'org123',
        },
      },
    })

    // Boots logged in with the persisted OAuth tokens exposed on the store.
    expect(getOAuthTokensState(instance).getCurrent()).toMatchObject({accessToken: 'oauth-access'})

    const first = logout(instance)
    // Session is marked as destroying so a concurrent call is a no-op
    expect(getAuthState(instance).getCurrent()).toMatchObject({isDestroyingSession: true})
    await logout(instance)
    await first

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({url: '/auth/oauth/revoke', tag: 'oauth.revoke'}),
    )
    expect(getOAuthTokensState(instance).getCurrent()).toBeNull()
    expect(getAuthState(instance).getCurrent()).toMatchObject({type: AuthStateType.LOGGED_OUT})
    expect(map.get(OAUTH_TOKENS_KEY)).toBeUndefined()
  })

  it('cleans up storage even if logout request fails', async () => {
    vi.mocked(getTokenFromStorage).mockReturnValue('token')
    const error = new Error('Logout request failed')
    const mockRequest = vi.fn().mockRejectedValue(error)
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const removeItem = vi.fn() as Storage['removeItem']

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {removeItem} as Storage,
      },
    })

    // logout rejects when the request fails, matching the pre-logging behavior
    await expect(logout(instance)).rejects.toThrow('Logout request failed')

    // Should still clean up storage even on error
    expect(removeItem).toHaveBeenCalledWith('__sanity_auth_token')
  })
})
