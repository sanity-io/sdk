import {BehaviorSubject, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type SanityInstance} from '../../store/createSanityInstance'
import {type StoreContext} from '../../store/defineStore'
import {AuthStateType} from '../authStateType'
import {type AuthStoreState} from '../authStore'
import {type AuthStrategyOptions} from '../authStrategy'
import {subscribeToStateAndFetchCurrentUser} from '../subscribeToStateAndFetchCurrentUser'
import {getStorageEvents} from '../utils'
import {
  getOauthInitialState,
  initializeOauthAuth,
  OAUTH_TOKENS_KEY,
  scheduleOAuthTokenRefresh,
  subscribeToOAuthStorageEvents,
} from './oauthAuth'
import {deserializeTokens, serializeTokens} from './oauthClient'
import {runOAuthTokenRefresh} from './oauthRefresh'
import {type OAuthTokens} from './types'

vi.mock('../subscribeToStateAndFetchCurrentUser')
vi.mock('./oauthRefresh')
vi.mock('../utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils')>()
  return {...original, getStorageEvents: vi.fn(() => new Subject())}
})

const tokens: OAuthTokens = {
  accessToken: 'access-1',
  tokenType: 'bearer',
  expiresIn: 3600,
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  refreshToken: 'refresh-1',
}

const expiredTokens: OAuthTokens = {...tokens, expiresAt: new Date('2020-01-01T00:00:00.000Z')}

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

const baseOptions = (
  overrides: Partial<AuthStrategyOptions> & {
    oauthConfig?: {clientId: string; redirectUri: string; organizationId: string}
    storageArea?: Storage
  } = {},
): AuthStrategyOptions => ({
  authConfig: {
    storageArea: overrides.storageArea,
    oauth: overrides.oauthConfig ?? {
      clientId: 'c',
      redirectUri: 'https://app/callback',
      organizationId: 'org',
    },
  },
  projectId: 'p',
  initialLocationHref: overrides.initialLocationHref ?? 'https://app/',
  clientFactory: vi.fn(),
})

describe('serialize/deserialize tokens', () => {
  it('round-trips tokens with expiresAt as an ISO string', () => {
    const raw = serializeTokens(tokens)
    expect(JSON.parse(raw).expiresAt).toBe('2030-01-01T00:00:00.000Z')
    expect(deserializeTokens(raw)).toEqual(tokens)
  })

  it('omits refreshToken when absent', () => {
    const {refreshToken: _omit, ...withoutRefresh} = tokens
    expect(deserializeTokens(serializeTokens(withoutRefresh))).not.toHaveProperty('refreshToken')
  })

  it('returns null for missing or malformed values', () => {
    expect(deserializeTokens(null)).toBeNull()
    expect(deserializeTokens('not json')).toBeNull()
    expect(deserializeTokens('{"foo":"bar"}')).toBeNull()
    expect(deserializeTokens('123')).toBeNull()
  })

  it('returns null when expiresAt does not parse to a valid date', () => {
    const raw = JSON.stringify({...JSON.parse(serializeTokens(tokens)), expiresAt: 'garbage'})
    expect(deserializeTokens(raw)).toBeNull()
  })
})

describe('getOauthInitialState', () => {
  it('returns LOGGED_IN with tokens when persisted tokens exist', () => {
    const storageArea = createMemoryStorage({[OAUTH_TOKENS_KEY]: serializeTokens(tokens)})
    const result = getOauthInitialState(baseOptions({storageArea}))
    expect(result.authState).toMatchObject({type: AuthStateType.LOGGED_IN, token: 'access-1'})
    expect(result.oauthTokens).toEqual(tokens)
    expect(result.authMethod).toBe('localstorage')
  })

  it('returns LOGGED_OUT and clears storage when persisted tokens are corrupt', () => {
    const storageArea = createMemoryStorage({
      [OAUTH_TOKENS_KEY]: '{"accessToken":"a","expiresAt":"garbage"}',
    })
    const result = getOauthInitialState(baseOptions({storageArea}))
    expect(result.authState).toEqual({type: AuthStateType.LOGGED_OUT, isDestroyingSession: false})
    expect(result.oauthTokens).toBeUndefined()
    expect(storageArea.getItem(OAUTH_TOKENS_KEY)).toBeNull()
  })

  it('returns LOGGING_IN and keeps the tokens when they have expired but can be refreshed', () => {
    const storageArea = createMemoryStorage({[OAUTH_TOKENS_KEY]: serializeTokens(expiredTokens)})
    const result = getOauthInitialState(baseOptions({storageArea}))
    // isExchangingToken makes handleOAuthCallback stand down while the refresh runs
    expect(result.authState).toEqual({type: AuthStateType.LOGGING_IN, isExchangingToken: true})
    expect(result.oauthTokens).toEqual(expiredTokens)
    expect(result.authMethod).toBe('localstorage')
    expect(storageArea.getItem(OAUTH_TOKENS_KEY)).not.toBeNull()
  })

  it('returns LOGGED_OUT and clears storage when expired tokens have no refresh token', () => {
    const {refreshToken: _omit, ...unrefreshable} = expiredTokens
    const storageArea = createMemoryStorage({[OAUTH_TOKENS_KEY]: serializeTokens(unrefreshable)})
    const result = getOauthInitialState(baseOptions({storageArea}))
    expect(result.authState).toEqual({type: AuthStateType.LOGGED_OUT, isDestroyingSession: false})
    expect(result.oauthTokens).toBeUndefined()
    expect(storageArea.getItem(OAUTH_TOKENS_KEY)).toBeNull()
  })

  it('returns LOGGING_IN when the callback URL matches the redirect URI', () => {
    const storageArea = createMemoryStorage()
    const result = getOauthInitialState(
      baseOptions({storageArea, initialLocationHref: 'https://app/callback?code=c&state=s'}),
    )
    expect(result.authState).toEqual({type: AuthStateType.LOGGING_IN, isExchangingToken: false})
  })

  it('returns LOGGED_OUT when a callback URL does not match the redirect URI', () => {
    const storageArea = createMemoryStorage()
    const result = getOauthInitialState(
      baseOptions({storageArea, initialLocationHref: 'https://other/callback?code=c&state=s'}),
    )
    expect(result.authState).toEqual({type: AuthStateType.LOGGED_OUT, isDestroyingSession: false})
  })

  it('returns LOGGED_OUT when the redirect URI only carries a stray state param', () => {
    const storageArea = createMemoryStorage()
    const result = getOauthInitialState(
      baseOptions({storageArea, initialLocationHref: 'https://app/callback?state=s'}),
    )
    expect(result.authState).toEqual({type: AuthStateType.LOGGED_OUT, isDestroyingSession: false})
  })

  it('returns LOGGED_OUT when there are no tokens and no callback', () => {
    const storageArea = createMemoryStorage()
    const result = getOauthInitialState(baseOptions({storageArea}))
    expect(result.authState).toEqual({type: AuthStateType.LOGGED_OUT, isDestroyingSession: false})
  })
})

describe('subscribeToOAuthStorageEvents', () => {
  let events: Subject<StorageEvent>

  beforeEach(() => {
    events = new Subject<StorageEvent>()
    vi.mocked(getStorageEvents).mockReturnValue(events)
  })

  function makeContext(storageArea: Storage): {
    context: StoreContext<AuthStoreState>
    set: ReturnType<typeof vi.fn>
  } {
    const set = vi.fn()
    const context = {
      state: {get: () => ({options: {storageArea}}), set},
      instance: {config: {}} as SanityInstance,
      key: null,
    } as unknown as StoreContext<AuthStoreState>
    return {context, set}
  }

  it('sets LOGGED_IN when tokens appear in another tab', () => {
    const storageArea = createMemoryStorage({[OAUTH_TOKENS_KEY]: serializeTokens(tokens)})
    const {context, set} = makeContext(storageArea)
    subscribeToOAuthStorageEvents(context)

    events.next({storageArea, key: OAUTH_TOKENS_KEY} as StorageEvent)

    expect(set).toHaveBeenCalledWith(
      'updateOAuthTokensFromStorageEvent',
      expect.objectContaining({
        authState: expect.objectContaining({type: AuthStateType.LOGGED_IN, token: 'access-1'}),
        oauthTokens: tokens,
      }),
    )
  })

  it('sets LOGGED_OUT when tokens are cleared in another tab', () => {
    const storageArea = createMemoryStorage()
    const {context, set} = makeContext(storageArea)
    subscribeToOAuthStorageEvents(context)

    events.next({storageArea, key: OAUTH_TOKENS_KEY} as StorageEvent)

    expect(set).toHaveBeenCalledWith('updateOAuthTokensFromStorageEvent', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
      oauthTokens: undefined,
    })
  })

  it('ignores events for other keys or storage areas', () => {
    const storageArea = createMemoryStorage()
    const {context, set} = makeContext(storageArea)
    subscribeToOAuthStorageEvents(context)

    events.next({storageArea, key: 'other'} as StorageEvent)
    events.next({storageArea: createMemoryStorage(), key: OAUTH_TOKENS_KEY} as StorageEvent)

    expect(set).not.toHaveBeenCalled()
  })
})

describe('initializeOauthAuth', () => {
  beforeEach(() => {
    vi.mocked(getStorageEvents).mockReturnValue(new Subject())
    vi.mocked(subscribeToStateAndFetchCurrentUser).mockReturnValue(new Subject().subscribe())
    vi.mocked(runOAuthTokenRefresh).mockReset().mockResolvedValue(null)
  })

  function makeContext(
    storageArea: Storage | undefined,
    initial: Partial<AuthStoreState> = {
      authState: {type: AuthStateType.LOGGED_IN, token: 'access-1', currentUser: null},
    },
  ): {context: StoreContext<AuthStoreState>; set: ReturnType<typeof vi.fn>} {
    const set = vi.fn()
    const state$ = new BehaviorSubject({...initial, options: {storageArea}})
    const context = {
      state: {get: () => state$.value, set, observable: state$},
      instance: {config: {}} as SanityInstance,
      key: null,
    } as unknown as StoreContext<AuthStoreState>
    return {context, set}
  }

  it('does not start the stamped-token refresher', () => {
    const result = initializeOauthAuth(makeContext(createMemoryStorage()).context)
    expect(result.tokenRefresherStarted).toBe(false)
    result.dispose()
  })

  it('subscribes without a storage area without throwing', () => {
    const result = initializeOauthAuth(makeContext(undefined).context)
    expect(() => result.dispose()).not.toThrow()
  })

  it('does not refresh when the persisted tokens are still valid', () => {
    initializeOauthAuth(makeContext(createMemoryStorage()).context).dispose()
    expect(runOAuthTokenRefresh).not.toHaveBeenCalled()
  })

  it('refreshes expired persisted tokens on startup', () => {
    const {context} = makeContext(createMemoryStorage(), {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: true},
      oauthTokens: expiredTokens,
    })
    initializeOauthAuth(context).dispose()
    expect(runOAuthTokenRefresh).toHaveBeenCalledWith(context)
  })

  it('surfaces a failed startup refresh as an auth error', async () => {
    const error = new Error('network down')
    vi.mocked(runOAuthTokenRefresh).mockRejectedValueOnce(error)
    const {context, set} = makeContext(createMemoryStorage(), {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: true},
      oauthTokens: expiredTokens,
    })
    initializeOauthAuth(context).dispose()
    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith('oauthStartupRefreshError', {
        authState: {type: AuthStateType.ERROR, error},
      }),
    )
  })
})

describe('scheduleOAuthTokenRefresh', () => {
  const NOW = new Date('2030-01-01T00:00:00.000Z').getTime()
  const freshTokens = (accessToken: string): OAuthTokens => ({
    ...tokens,
    accessToken,
    expiresIn: 3600,
    expiresAt: new Date(Date.now() + 3600_000),
  })

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    })
    vi.setSystemTime(NOW)
    vi.mocked(runOAuthTokenRefresh).mockReset().mockResolvedValue(null)
  })
  afterEach(() => vi.useRealTimers())

  function makeContext(oauthTokens: OAuthTokens | undefined) {
    const state$ = new BehaviorSubject({oauthTokens} as AuthStoreState)
    const context = {
      state: {get: () => state$.value, set: vi.fn(), observable: state$},
      instance: {config: {}} as SanityInstance,
      key: null,
    } as unknown as StoreContext<AuthStoreState>
    return {context, state$}
  }

  it('refreshes one minute before the access token expires', async () => {
    const {context} = makeContext(freshTokens('access-1'))
    const subscription = scheduleOAuthTokenRefresh(context)

    await vi.advanceTimersByTimeAsync(3540_000 - 1)
    expect(runOAuthTokenRefresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(runOAuthTokenRefresh).toHaveBeenCalledTimes(1)
    subscription.unsubscribe()
  })

  it('refreshes at half the lifetime when the token lives under two minutes', async () => {
    const {context} = makeContext({
      ...freshTokens('a'),
      expiresIn: 60,
      expiresAt: new Date(NOW + 60_000),
    })
    const subscription = scheduleOAuthTokenRefresh(context)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(runOAuthTokenRefresh).toHaveBeenCalledTimes(1)
    subscription.unsubscribe()
  })

  it('reschedules from the new expiry when the tokens change', async () => {
    const {context, state$} = makeContext(freshTokens('access-1'))
    const subscription = scheduleOAuthTokenRefresh(context)

    await vi.advanceTimersByTimeAsync(1800_000)
    state$.next({oauthTokens: freshTokens('access-2')} as AuthStoreState)
    await vi.advanceTimersByTimeAsync(1800_000)
    expect(runOAuthTokenRefresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1740_000)
    expect(runOAuthTokenRefresh).toHaveBeenCalledTimes(1)
    subscription.unsubscribe()
  })

  it('does not schedule a refresh without a refresh token', async () => {
    const {refreshToken: _, ...withoutRefresh} = freshTokens('access-1')
    const subscription = scheduleOAuthTokenRefresh(makeContext(withoutRefresh).context)

    await vi.advanceTimersByTimeAsync(3600_000)
    expect(runOAuthTokenRefresh).not.toHaveBeenCalled()
    subscription.unsubscribe()
  })

  it('retries a transient failure with backoff', async () => {
    vi.mocked(runOAuthTokenRefresh)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(null)
    const subscription = scheduleOAuthTokenRefresh(makeContext(freshTokens('access-1')).context)

    await vi.advanceTimersByTimeAsync(3540_000)
    expect(runOAuthTokenRefresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(runOAuthTokenRefresh).toHaveBeenCalledTimes(2)
    subscription.unsubscribe()
  })

  it('stops retrying once a failed refresh has logged the user out', async () => {
    const {context, state$} = makeContext(freshTokens('access-1'))
    vi.mocked(runOAuthTokenRefresh).mockImplementation(async () => {
      state$.next({oauthTokens: undefined} as AuthStoreState)
      throw new Error('invalid_grant')
    })
    const subscription = scheduleOAuthTokenRefresh(context)

    await vi.advanceTimersByTimeAsync(3540_000 + 60_000)
    expect(runOAuthTokenRefresh).toHaveBeenCalledTimes(1)
    subscription.unsubscribe()
  })
})
