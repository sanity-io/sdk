import {type ClientConfig, type SanityClient} from '@sanity/client'
import {NEVER} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../../store/createSanityInstance'
import {AuthStateType} from '../authStateType'
import {getAuthState} from '../authStore'
import {subscribeToStateAndFetchCurrentUser} from '../subscribeToStateAndFetchCurrentUser'
import {
  getOAuthTokensState,
  handleOAuthCallback,
  OAUTH_STATE_KEY,
  OAUTH_VERIFIER_KEY,
  refreshOAuthTokens,
  revokeOAuthTokens,
  serializeTokens,
  startOAuthAuthorization,
} from './oauthActions'
import {deserializeTokens, OAUTH_TOKENS_KEY} from './oauthAuth'
import {type OAuthTokens} from './types'

const readStored = (storage: Storage) => deserializeTokens(storage.getItem(OAUTH_TOKENS_KEY))

vi.mock('../subscribeToStateAndFetchCurrentUser')
vi.mock('../../utils/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../utils/logger')>()
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

const oauthConfig = {
  clientId: 'client-abc',
  redirectUri: 'https://app.example.com/callback',
  organizationId: 'org123',
}

const seededTokens: OAuthTokens = {
  accessToken: 'stored-access',
  tokenType: 'bearer',
  expiresIn: 3600,
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  refreshToken: 'stored-refresh',
}

const tokenResponse = {
  access_token: 'new-access',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'new-refresh',
}

function createMemoryStorage(seed?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  } as Storage
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

let instance: SanityInstance | undefined

interface SetupOptions {
  request?: ReturnType<typeof vi.fn>
  storageSeed?: Record<string, string>
  sessionSeed?: Record<string, string>
  initialLocationHref?: string
  withOAuthConfig?: boolean
  apiHost?: string
}

function setup(options: SetupOptions = {}) {
  const request = options.request ?? vi.fn().mockResolvedValue(tokenResponse)
  const clientFactory = vi.fn((_config: ClientConfig) => ({request}) as unknown as SanityClient)
  const storageArea = createMemoryStorage(options.storageSeed)
  const session = createMemoryStorage(options.sessionSeed)
  vi.stubGlobal('sessionStorage', session)

  instance = createSanityInstance({
    projectId: 'p',
    dataset: 'd',
    auth: {
      clientFactory,
      storageArea,
      initialLocationHref: options.initialLocationHref ?? 'https://app.example.com/',
      ...(options.apiHost && {apiHost: options.apiHost}),
      ...(options.withOAuthConfig === false ? {} : {oauth: oauthConfig}),
    },
  })

  return {request, clientFactory, storageArea, session}
}

function parseBody(body: unknown): URLSearchParams {
  return new URLSearchParams(body as string)
}

beforeEach(() => {
  vi.mocked(subscribeToStateAndFetchCurrentUser).mockReturnValue(NEVER.subscribe())
})

afterEach(() => {
  instance?.dispose()
  instance = undefined
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('startOAuthAuthorization', () => {
  it('persists verifier/state and navigates to the authorize URL', async () => {
    const assign = vi.fn()
    vi.stubGlobal('window', {location: {assign}})
    const {session} = setup({initialLocationHref: 'https://app.example.com/'})

    await startOAuthAuthorization(instance!)

    expect(session.getItem(OAUTH_VERIFIER_KEY)).toBeTruthy()
    expect(session.getItem(OAUTH_STATE_KEY)).toBeTruthy()

    expect(assign).toHaveBeenCalledTimes(1)
    const url = new URL(assign.mock.calls[0][0])
    expect(url.pathname).toBe('/v1/auth/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-abc')
    expect(url.searchParams.get('redirect_uri')).toBe(oauthConfig.redirectUri)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('state')).toBe(session.getItem(OAUTH_STATE_KEY))
    expect(url.searchParams.getAll('resource')).toEqual(['urn:io.sanity:organization:org123'])
  })

  it('throws when OAuth is not configured', async () => {
    setup({withOAuthConfig: false})
    await expect(startOAuthAuthorization(instance!)).rejects.toThrow(/OAuth is not configured/)
  })
})

describe('handleOAuthCallback', () => {
  const callbackHref = 'https://app.example.com/callback?code=auth-code&state=state-xyz'

  it('exchanges the code, persists tokens, clears artifacts and logs in', async () => {
    const {request, storageArea, session, clientFactory} = setup({
      apiHost: 'https://api.sanity.work',
      sessionSeed: {[OAUTH_STATE_KEY]: 'state-xyz', [OAUTH_VERIFIER_KEY]: 'verifier-1'},
    })

    const result = await handleOAuthCallback(instance!, callbackHref)

    expect(result).toBe('https://app.example.com/callback')
    expect(clientFactory).toHaveBeenCalledWith(
      expect.objectContaining({apiHost: 'https://api.sanity.work'}),
    )
    expect(request).toHaveBeenCalledTimes(1)
    const call = request.mock.calls[0][0]
    expect(call).toMatchObject({
      method: 'POST',
      url: '/auth/oauth/token',
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      tag: 'oauth.token',
    })
    const body = parseBody(call.body)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('auth-code')
    expect(body.get('code_verifier')).toBe('verifier-1')
    expect(body.get('redirect_uri')).toBe(oauthConfig.redirectUri)
    expect(body.get('client_id')).toBe('client-abc')
    expect(body.get('resource')).toBe('urn:io.sanity:organization:org123')

    expect(readStored(storageArea)).toMatchObject({accessToken: 'new-access'})
    expect(session.getItem(OAUTH_VERIFIER_KEY)).toBeNull()
    expect(session.getItem(OAUTH_STATE_KEY)).toBeNull()

    expect(getAuthState(instance!).getCurrent()).toMatchObject({
      type: AuthStateType.LOGGED_IN,
      token: 'new-access',
    })
  })

  it('does not perform a second exchange on a duplicate concurrent invocation', async () => {
    const pending = deferred<typeof tokenResponse>()
    const request = vi.fn().mockReturnValue(pending.promise)
    setup({
      request,
      sessionSeed: {[OAUTH_STATE_KEY]: 'state-xyz', [OAUTH_VERIFIER_KEY]: 'verifier-1'},
    })

    const first = handleOAuthCallback(instance!, callbackHref)
    const second = await handleOAuthCallback(instance!, callbackHref)

    expect(second).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)

    pending.resolve(tokenResponse)
    expect(await first).toBe('https://app.example.com/callback')
  })

  it('surfaces an ?error= callback as ERROR without exchanging', async () => {
    const {request} = setup()

    const result = await handleOAuthCallback(
      instance!,
      'https://app.example.com/callback?error=access_denied&error_description=denied',
    )

    expect(result).toBe('https://app.example.com/callback')
    expect(request).not.toHaveBeenCalled()
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.ERROR})
  })

  it('surfaces an ?error= callback without a description', async () => {
    setup()
    await handleOAuthCallback(instance!, 'https://app.example.com/callback?error=access_denied')
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.ERROR})
  })

  it('rejects a state mismatch as ERROR without exchanging', async () => {
    const {request} = setup({
      sessionSeed: {[OAUTH_STATE_KEY]: 'different', [OAUTH_VERIFIER_KEY]: 'verifier-1'},
    })

    const result = await handleOAuthCallback(instance!, callbackHref)

    expect(result).toBe('https://app.example.com/callback')
    expect(request).not.toHaveBeenCalled()
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.ERROR})
  })

  it('errors when the code verifier is missing', async () => {
    const {request} = setup({sessionSeed: {[OAUTH_STATE_KEY]: 'state-xyz'}})

    const result = await handleOAuthCallback(instance!, callbackHref)

    expect(result).toBe('https://app.example.com/callback')
    expect(request).not.toHaveBeenCalled()
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.ERROR})
  })

  it('returns false when there is no code in the URL', async () => {
    const {request} = setup()
    const result = await handleOAuthCallback(instance!, 'https://app.example.com/callback')
    expect(result).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('sets ERROR when the token exchange fails', async () => {
    const request = vi.fn().mockRejectedValue(new Error('boom'))
    const {session} = setup({
      request,
      sessionSeed: {[OAUTH_STATE_KEY]: 'state-xyz', [OAUTH_VERIFIER_KEY]: 'verifier-1'},
    })

    const result = await handleOAuthCallback(instance!, callbackHref)

    expect(result).toBe('https://app.example.com/callback')
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.ERROR})
    expect(session.getItem(OAUTH_VERIFIER_KEY)).toBeNull()
  })
})

describe('refreshOAuthTokens', () => {
  it('refreshes tokens and persists them', async () => {
    const {request, storageArea} = setup({
      storageSeed: {[OAUTH_TOKENS_KEY]: serializeTokens(seededTokens)},
    })

    const result = await refreshOAuthTokens(instance!)

    expect(request).toHaveBeenCalledTimes(1)
    const body = parseBody(request.mock.calls[0][0].body)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('stored-refresh')
    expect(body.get('client_id')).toBe('client-abc')
    expect(body.get('resource')).toBe('urn:io.sanity:organization:org123')

    expect(result).toMatchObject({accessToken: 'new-access', refreshToken: 'new-refresh'})
    expect(readStored(storageArea)).toMatchObject({accessToken: 'new-access'})
  })

  it('shares a single in-flight request across concurrent callers', async () => {
    const pending = deferred<typeof tokenResponse>()
    const request = vi.fn().mockReturnValue(pending.promise)
    setup({
      request,
      storageSeed: {[OAUTH_TOKENS_KEY]: serializeTokens(seededTokens)},
    })

    const a = refreshOAuthTokens(instance!)
    const b = refreshOAuthTokens(instance!)

    pending.resolve(tokenResponse)
    const [ra, rb] = await Promise.all([a, b])

    expect(request).toHaveBeenCalledTimes(1)
    expect(ra).toBe(rb)
    expect(ra).toMatchObject({accessToken: 'new-access'})
  })

  it('keeps the previous refresh token when the endpoint omits one', async () => {
    const request = vi.fn().mockResolvedValue({
      access_token: 'new-access',
      token_type: 'bearer',
      expires_in: 3600,
    })
    const {storageArea} = setup({
      request,
      storageSeed: {[OAUTH_TOKENS_KEY]: serializeTokens(seededTokens)},
    })

    await refreshOAuthTokens(instance!)

    expect(readStored(storageArea)).toMatchObject({refreshToken: 'stored-refresh'})
  })

  it('logs out when there is no refresh token', async () => {
    const noRefresh = {...seededTokens, refreshToken: undefined}
    const {request, storageArea} = setup({
      storageSeed: {[OAUTH_TOKENS_KEY]: serializeTokens(noRefresh)},
    })

    const result = await refreshOAuthTokens(instance!)

    expect(result).toBeNull()
    expect(request).not.toHaveBeenCalled()
    expect(readStored(storageArea)).toBeNull()
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.LOGGED_OUT})
  })

  it('clears tokens and logs out on an unrecoverable refresh failure', async () => {
    const request = vi.fn().mockRejectedValue(new Error('invalid_grant'))
    const {storageArea} = setup({
      request,
      storageSeed: {[OAUTH_TOKENS_KEY]: serializeTokens(seededTokens)},
    })

    await expect(refreshOAuthTokens(instance!)).rejects.toThrow('invalid_grant')
    expect(readStored(storageArea)).toBeNull()
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.LOGGED_OUT})
  })
})

describe('revokeOAuthTokens', () => {
  it('revokes with token and client_id, then clears local state', async () => {
    const {request, storageArea} = setup({
      storageSeed: {[OAUTH_TOKENS_KEY]: serializeTokens(seededTokens)},
    })

    await revokeOAuthTokens(instance!)

    expect(request).toHaveBeenCalledTimes(1)
    const call = request.mock.calls[0][0]
    expect(call).toMatchObject({method: 'POST', url: '/auth/oauth/revoke', tag: 'oauth.revoke'})
    const body = parseBody(call.body)
    expect(body.get('token')).toBe('stored-refresh')
    expect(body.get('client_id')).toBe('client-abc')

    expect(readStored(storageArea)).toBeNull()
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.LOGGED_OUT})
  })

  it('clears local state even when the revoke request fails', async () => {
    const request = vi.fn().mockRejectedValue(new Error('revoke failed'))
    const {storageArea} = setup({
      request,
      storageSeed: {[OAUTH_TOKENS_KEY]: serializeTokens(seededTokens)},
    })

    await expect(revokeOAuthTokens(instance!)).resolves.toBeUndefined()
    expect(readStored(storageArea)).toBeNull()
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.LOGGED_OUT})
  })

  it('clears state without calling the endpoint when there is no token', async () => {
    const {request, storageArea} = setup()

    await revokeOAuthTokens(instance!)

    expect(request).not.toHaveBeenCalled()
    expect(readStored(storageArea)).toBeNull()
    expect(getAuthState(instance!).getCurrent()).toMatchObject({type: AuthStateType.LOGGED_OUT})
  })
})

describe('getOAuthTokensState', () => {
  it('exposes the current OAuth tokens', () => {
    setup({storageSeed: {[OAUTH_TOKENS_KEY]: serializeTokens(seededTokens)}})
    expect(getOAuthTokensState(instance!).getCurrent()).toEqual(seededTokens)
  })

  it('returns null when there are no OAuth tokens', () => {
    setup()
    expect(getOAuthTokensState(instance!).getCurrent()).toBeNull()
  })
})
