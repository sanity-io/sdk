import {beforeEach, describe, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {AuthStateType, authStore} from './authStore'
import {handleCallback} from './handleCallback'
import {getAuthCode, getSanityAuthCode, getTokenFromStorage} from './utils'

vi.mock('./utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./utils')>()
  return {
    ...original,
    getTokenFromStorage: vi.fn(),
    getAuthCode: vi.fn(),
    getSanityAuthCode: vi.fn(),
  }
})

describe('handleCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trades the auth code for a token, sets the state to logged in, and sets the token in storage', async () => {
    const mockRequest = vi.fn().mockResolvedValue({token: 'new-token'})
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const setItem = vi.fn()
    vi.mocked(getTokenFromStorage).mockReturnValue(null)
    const authCode = 'auth-code'
    vi.mocked(getAuthCode).mockReturnValue(authCode)

    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
      },
    })

    const state = createResourceState(authStore.getInitialState(instance))
    expect(state.get()).toMatchObject({authState: {isExchangingToken: false}})

    const resultPromise = handleCallback(
      {instance, state},
      'https://example.com/callback?foo=bar#withSid=code',
    )

    expect(state.get()).toMatchObject({authState: {isExchangingToken: true}})
    const result = await resultPromise

    expect(result).toBe('https://example.com/callback?foo=bar')
    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      dataset: 'd',
      projectId: 'p',
      requestTagPrefix: 'sdk.auth',
      useProjectHostname: true,
    })
    expect(mockRequest).toHaveBeenLastCalledWith({
      method: 'GET',
      query: {sid: authCode},
      tag: 'fetch-token',
      uri: '/auth/fetch',
    })
    expect(setItem).toHaveBeenCalledWith(state.get().options.storageKey, '{"token":"new-token"}')
  })

  it('returns early if there is a provided token', async () => {
    const mockRequest = vi.fn().mockResolvedValue({token: 'new-token'})
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const setItem = vi.fn()
    vi.mocked(getTokenFromStorage).mockReturnValue(null)
    const authCode = 'auth-code'
    vi.mocked(getAuthCode).mockReturnValue(authCode)

    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
        token: 'provided-token',
      },
    })

    const state = createResourceState(authStore.getInitialState(instance))
    const result = await handleCallback(
      {instance, state},
      'https://example.com/callback?foo=bar#withSid=code',
    )

    expect(result).toBe(false)
    expect(clientFactory).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('returns early if already exchanging the the token', async () => {
    const clientFactory = vi.fn()
    const setItem = vi.fn()

    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
      },
    })

    const state = createResourceState(authStore.getInitialState(instance))
    state.set('setAlreadyExchanging', {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: true},
    })
    const result = await handleCallback(
      {instance, state},
      'https://example.com/callback?foo=bar#withSid=code',
    )

    expect(result).toBe(false)
    expect(clientFactory).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('returns early if there is no auth code present', async () => {
    const clientFactory = vi.fn()
    const setItem = vi.fn()

    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
      },
    })
    vi.mocked(getAuthCode).mockReturnValue(null)

    const state = createResourceState(authStore.getInitialState(instance))
    const result = await handleCallback(
      {instance, state},
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

    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
      },
    })

    const state = createResourceState(authStore.getInitialState(instance))
    const result = await handleCallback(
      {instance, state},
      'https://example.com/callback?foo=bar#withSid=code',
    )

    expect(result).toBe(false)
    expect(state.get()).toMatchObject({authState: {type: AuthStateType.ERROR, error}})

    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      dataset: 'd',
      projectId: 'p',
      requestTagPrefix: 'sdk.auth',
      useProjectHostname: true,
    })
    expect(mockRequest).toHaveBeenLastCalledWith({
      method: 'GET',
      query: {sid: authCode},
      tag: 'fetch-token',
      uri: '/auth/fetch',
    })
  })

  it('falls back to getAuthCode when getSanityAuthCode returns null', async () => {
    const mockRequest = vi.fn().mockResolvedValue({token: 'new-token'})
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const setItem = vi.fn()
    const locationHref = 'https://example.com/callback?foo=bar#withSid=code'

    vi.mocked(getSanityAuthCode).mockReturnValue(null)
    vi.mocked(getAuthCode).mockReturnValue('fallback-auth-code')

    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {setItem} as unknown as Storage,
      },
    })

    const state = createResourceState(authStore.getInitialState(instance))
    await handleCallback({instance, state}, locationHref)

    expect(getSanityAuthCode).toHaveBeenCalledWith(locationHref)
    expect(getAuthCode).toHaveBeenCalledWith(state.get().options.callbackUrl, locationHref)
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {sid: 'fallback-auth-code'},
      }),
    )
  })
})
