import {NEVER} from 'rxjs'
import {beforeEach, describe, it} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {AuthStateType} from './authStateType'
import {getAuthState} from './authStore'
import {handleAuthCallback} from './handleAuthCallback'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getAuthCode, getTokenFromStorage} from './utils'

vi.mock('./utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./utils')>()
  return {...original, getTokenFromStorage: vi.fn(), getAuthCode: vi.fn()}
})

vi.mock('./subscribeToStateAndFetchCurrentUser')
vi.mock('./subscribeToStorageEventsAndSetToken')

let instance: SanityInstance | undefined

describe('handleCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(subscribeToStateAndFetchCurrentUser).mockImplementation(() => NEVER.subscribe())
    vi.mocked(subscribeToStorageEventsAndSetToken).mockImplementation(() => NEVER.subscribe())
  })

  afterEach(() => {
    instance?.dispose()
  })

  it('trades the auth code for a token, sets the state to logged in, and sets the token in storage', async () => {
    const request = vi.fn().mockResolvedValue({token: 'new-token'})
    const clientFactory = vi.fn().mockReturnValue({request})
    const setItem = vi.fn()
    vi.mocked(getTokenFromStorage).mockReturnValue(null)
    const authCode = 'auth-code'
    vi.mocked(getAuthCode).mockReturnValue(authCode)

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
      },
    })

    const authState = getAuthState(instance)

    expect(authState.getCurrent()).toMatchObject({isExchangingToken: false})

    const resultPromise = handleAuthCallback(
      instance,
      'https://example.com/callback?foo=bar#withSid=code',
    )

    expect(authState.getCurrent()).toMatchObject({isExchangingToken: true})
    const result = await resultPromise

    expect(result).toBe('https://example.com/callback?foo=bar')
    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      requestTagPrefix: 'sanity.sdk.auth',
      useProjectHostname: false,
    })
    expect(request).toHaveBeenLastCalledWith({
      method: 'GET',
      query: {sid: authCode},
      tag: 'fetch-token',
      uri: '/auth/fetch',
    })
    expect(setItem).toHaveBeenCalledWith('__sanity_auth_token', '{"token":"new-token"}')
  })

  it('returns early if there is a provided token', async () => {
    const mockRequest = vi.fn().mockResolvedValue({token: 'new-token'})
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const setItem = vi.fn()
    vi.mocked(getTokenFromStorage).mockReturnValue(null)
    const authCode = 'auth-code'
    vi.mocked(getAuthCode).mockReturnValue(authCode)

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
        token: 'provided-token',
      },
    })

    const result = await handleAuthCallback(
      instance,
      'https://example.com/callback?foo=bar#withSid=code',
    )

    expect(result).toBe(false)
    expect(clientFactory).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('returns early if already exchanging the the token', async () => {
    let resolveRequest!: (value: {token: string; label: string}) => void
    const requestPromise = new Promise<{token: string; label: string}>((resolve) => {
      resolveRequest = resolve
    })
    vi.mocked(getAuthCode).mockReturnValue('code')
    const request = vi.fn().mockReturnValue(requestPromise)
    const clientFactory = vi.fn().mockReturnValue({request})
    const setItem = vi.fn()

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem: setItem as Storage['setItem']} as Storage,
      },
    })

    const authState = getAuthState(instance)
    expect(authState.getCurrent()).toMatchObject({type: AuthStateType.LOGGING_IN})

    const locationHref = 'https://example.com/callback?foo=bar#withSid=code'
    const originalResultPromise = handleAuthCallback(instance, locationHref)

    expect(authState.getCurrent()).toMatchObject({
      type: AuthStateType.LOGGING_IN,
      isExchangingToken: true,
    })

    // ensures mock calls are reset to zero
    clientFactory.mockClear()
    setItem.mockClear()

    // notice how this resolves first
    const earlyResult = await handleAuthCallback(instance, locationHref)
    expect(earlyResult).toBe(false)

    expect(clientFactory).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()

    // this will resolve
    resolveRequest({token: 'token', label: 'label'})
    expect(await originalResultPromise).toBe('https://example.com/callback?foo=bar')

    // expect(result).toBe(false)
  })

  it('returns early if there is no auth code present', async () => {
    const clientFactory = vi.fn()
    const setItem = vi.fn()

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
      },
    })
    vi.mocked(getAuthCode).mockReturnValue(null)

    const result = await handleAuthCallback(
      instance,
      'https://example.com/callback?foo=bar#withSid=code',
    )

    expect(result).toBe(false)
    expect(clientFactory).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('sets an auth error if exchanging the token fails', async () => {
    const error = new Error('test error')
    const mockRequest = vi.fn().mockRejectedValue(error)
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const setItem = vi.fn()
    vi.mocked(getTokenFromStorage).mockReturnValue(null)
    const authCode = 'auth-code'
    vi.mocked(getAuthCode).mockReturnValue(authCode)

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
      },
    })

    const authState = getAuthState(instance)
    const result = await handleAuthCallback(
      instance,
      'https://example.com/callback?foo=bar#withSid=code',
    )

    expect(result).toBe(false)
    expect(authState.getCurrent()).toMatchObject({type: AuthStateType.ERROR, error})

    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      requestTagPrefix: 'sanity.sdk.auth',
      useProjectHostname: false,
    })
    expect(mockRequest).toHaveBeenLastCalledWith({
      method: 'GET',
      query: {sid: authCode},
      tag: 'fetch-token',
      uri: '/auth/fetch',
    })
  })
})
