import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {type SanityInstance} from '../../store/createSanityInstance'
import {type StoreContext} from '../../store/defineStore'
import {AuthStateType} from '../authStateType'
import {type AuthStoreState} from '../authStore'
import {type AuthStrategyOptions} from '../authStrategy'
import {subscribeToStateAndFetchCurrentUser} from '../subscribeToStateAndFetchCurrentUser'
import {getStorageEvents} from '../utils'
import {serializeTokens} from './oauthActions'
import {
  deserializeTokens,
  getOauthInitialState,
  initializeOauthAuth,
  OAUTH_TOKENS_KEY,
  subscribeToOAuthStorageEvents,
} from './oauthAuth'
import {type OAuthTokens} from './types'

vi.mock('../subscribeToStateAndFetchCurrentUser')
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
})

describe('getOauthInitialState', () => {
  it('returns LOGGED_IN with tokens when persisted tokens exist', () => {
    const storageArea = createMemoryStorage({[OAUTH_TOKENS_KEY]: serializeTokens(tokens)})
    const result = getOauthInitialState(baseOptions({storageArea}))
    expect(result.authState).toMatchObject({type: AuthStateType.LOGGED_IN, token: 'access-1'})
    expect(result.oauthTokens).toEqual(tokens)
    expect(result.authMethod).toBe('localstorage')
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
  })

  function makeContext(storageArea: Storage | undefined): StoreContext<AuthStoreState> {
    return {
      state: {get: () => ({options: {storageArea}}), set: vi.fn()},
      instance: {config: {}} as SanityInstance,
      key: null,
    } as unknown as StoreContext<AuthStoreState>
  }

  it('does not start the stamped-token refresher', () => {
    const result = initializeOauthAuth(makeContext(createMemoryStorage()))
    expect(result.tokenRefresherStarted).toBe(false)
    result.dispose()
  })

  it('subscribes without a storage area without throwing', () => {
    const result = initializeOauthAuth(makeContext(undefined))
    expect(() => result.dispose()).not.toThrow()
  })
})
