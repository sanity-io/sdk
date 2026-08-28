import {EMPTY, NEVER} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {AUTH_CODE_PARAM, DEFAULT_BASE} from './authConstants'
import {
  getAuthCode,
  getCleanedUrl,
  getClientErrorApiDescription,
  getClientErrorFromCauseChain,
  getClientErrorStatusCode,
  getDefaultLocation,
  getDefaultStorage,
  getStorageEvents,
  getTokenFromLocation,
  getTokenFromStorage,
  isProjectUserNotFoundClientError,
  shouldDeferErrorToSdk,
} from './utils'

vi.mock('rxjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('rxjs')>()
  return {...original, fromEvent: () => NEVER}
})

describe('getAuthCode', () => {
  it('returns auth code when present in hash and callback matches', () => {
    const testCode = 'test123'
    const testUrl = `http://example.com/callback#${AUTH_CODE_PARAM}=${testCode}`
    const result = getAuthCode('/callback', testUrl)
    expect(result).toBe(testCode)
  })

  it('returns null when callback location does not match', () => {
    const testCode = 'test123'
    const testUrl = `http://example.com/different#${AUTH_CODE_PARAM}=${testCode}`
    const result = getAuthCode('/callback', testUrl)
    expect(result).toBe(null)
  })

  it('returns null when auth code is not present', () => {
    const testUrl = 'http://example.com/callback#other=value'
    const result = getAuthCode('/callback', testUrl)
    expect(result).toBe(null)
  })

  it('does not match again the callback url if undefined', () => {
    const testCode = 'test123'
    const testUrl = `http://example.com/who-cares#${AUTH_CODE_PARAM}=${testCode}`
    const result = getAuthCode(undefined, testUrl)
    expect(result).toBe(testCode)
  })
})

describe('getTokenFromStorage', () => {
  let mockStorage: Storage

  beforeEach(() => {
    mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    }
  })

  it('returns token when valid data is stored', () => {
    const testToken = 'valid-token'
    mockStorage.getItem = vi.fn().mockReturnValue(JSON.stringify({token: testToken}))

    const result = getTokenFromStorage(mockStorage, 'auth-key')
    expect(result).toBe(testToken)
  })

  it('returns null when getItem returns null', () => {
    mockStorage.getItem = vi.fn().mockReturnValue(null)

    const result = getTokenFromStorage(mockStorage, 'auth-key')
    expect(result).toBe(null)
  })

  it('returns null when storage is undefined', () => {
    const result = getTokenFromStorage(undefined, 'auth-key')
    expect(result).toBe(null)
  })

  it('returns null and cleans storage when data is invalid', () => {
    mockStorage.getItem = vi.fn().mockReturnValue('invalid-json')

    const result = getTokenFromStorage(mockStorage, 'auth-key')
    expect(result).toBe(null)
    expect(mockStorage.removeItem).toHaveBeenCalledWith('auth-key')
  })

  it('returns null when stored object does not contain token', () => {
    mockStorage.getItem = vi.fn().mockReturnValue(JSON.stringify({other: 'value'}))

    const result = getTokenFromStorage(mockStorage, 'auth-key')
    expect(result).toBe(null)
    expect(mockStorage.removeItem).toHaveBeenCalledWith('auth-key')
  })
})

describe('getStorageEvents', () => {
  const originalWindow = global.window

  afterEach(() => {
    vi.stubGlobal('window', originalWindow)
  })

  it('returns EMPTY observable when not in browser environment', () => {
    vi.stubGlobal('window', undefined)
    const result = getStorageEvents()
    expect(result).toBe(EMPTY)
  })

  it('returns storage event observable when in browser environment', () => {
    const mockWindow = {
      addEventListener: vi.fn(),
    }
    vi.stubGlobal('window', mockWindow)

    const result = getStorageEvents()
    expect(result).not.toBe(EMPTY)
  })
})

describe('getDefaultStorage', () => {
  const originalLocalStorage = global.localStorage

  afterEach(() => {
    vi.stubGlobal('localStorage', originalLocalStorage)
  })

  it('returns localStorage when available', () => {
    const mockLocalStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    }
    vi.stubGlobal('localStorage', mockLocalStorage)

    const result = getDefaultStorage()
    expect(result).toBe(mockLocalStorage)
  })

  it('returns undefined when localStorage is not available', () => {
    vi.stubGlobal('localStorage', undefined)
    const result = getDefaultStorage()
    expect(result).toBeUndefined()
  })

  it('returns undefined when localStorage throws error', () => {
    const mockLocalStorage = {
      get getItem() {
        throw new Error('Access denied')
      },
    }
    vi.stubGlobal('localStorage', mockLocalStorage)

    const result = getDefaultStorage()
    expect(result).toBeUndefined()
  })
})

describe('getDefaultLocation', () => {
  const originalLocation = global.location

  afterEach(() => {
    vi.stubGlobal('location', originalLocation)
  })

  it('returns location.href when available', () => {
    const testHref = 'http://example.com'
    const mockLocation = {href: testHref}
    vi.stubGlobal('location', mockLocation)

    const result = getDefaultLocation()
    expect(result).toBe(testHref)
  })

  it('returns DEFAULT_BASE when location is undefined', () => {
    vi.stubGlobal('location', undefined)
    const result = getDefaultLocation()
    expect(result).toBe(DEFAULT_BASE)
  })

  it('returns DEFAULT_BASE when location.href is not a string', () => {
    const mockLocation = {href: null}
    vi.stubGlobal('location', mockLocation)

    const result = getDefaultLocation()
    expect(result).toBe(DEFAULT_BASE)
  })

  it('returns DEFAULT_BASE when accessing location throws error', () => {
    vi.stubGlobal('location', {
      get href() {
        throw new Error('Access denied')
      },
    })

    const result = getDefaultLocation()
    expect(result).toBe(DEFAULT_BASE)
  })
})

describe('getTokenFromLocation', () => {
  it('returns token when present in hash', () => {
    const testToken = 'test-token-123'
    const testUrl = `http://example.com/page#token=${testToken}`
    const result = getTokenFromLocation(testUrl)
    expect(result).toBe(testToken)
  })

  it('returns null when token is not present in hash', () => {
    const testUrl = 'http://example.com/page#other=value'
    const result = getTokenFromLocation(testUrl)
    expect(result).toBe(null)
  })

  it('returns null when hash is empty', () => {
    const testUrl = 'http://example.com/page'
    const result = getTokenFromLocation(testUrl)
    expect(result).toBe(null)
  })

  it('handles complex URLs correctly', () => {
    const testToken = 'complex-token-with-special-chars'
    const testUrl = `http://example.com/page?query=param#other=value&token=${testToken}`
    const result = getTokenFromLocation(testUrl)
    expect(result).toBe(testToken)
  })
})

describe('getCleanedUrl', () => {
  it('removes only token from hash when it is the only param', () => {
    const url = 'http://example.com/page#token=abc'
    const cleaned = getCleanedUrl(url)
    expect(cleaned).toBe('http://example.com/page')
  })

  it('removes only token from hash and preserves other hash params', () => {
    const url = 'http://example.com/page#token=abc&foo=bar'
    const cleaned = getCleanedUrl(url)
    expect(cleaned).toBe('http://example.com/page#foo=bar')
  })

  it('removes token when it appears among multiple hash params', () => {
    const url = 'http://example.com/page#foo=bar&token=abc&baz=qux'
    const cleaned = getCleanedUrl(url)
    expect(cleaned).toBe('http://example.com/page#foo=bar&baz=qux')
  })

  it('removes sid and url from query string while preserving others', () => {
    const url =
      'http://example.com/callback?sid=s1&url=https%3A%2F%2Freturn.example%2Fdone&x=1#token=abc'
    const cleaned = getCleanedUrl(url)
    expect(cleaned).toBe('http://example.com/callback?x=1')
  })

  it('preserves non key-value hash fragments', () => {
    const url = 'http://example.com/page#section'
    const cleaned = getCleanedUrl(url)
    expect(cleaned).toBe('http://example.com/page#section')
  })
})
/**
 * Mimics the shape a `ClientError` exposes without constructing one, which is
 * exactly the situation these helpers exist for: an app bundling a second copy
 * of `@sanity/client` throws errors that fail `instanceof` against ours.
 */
function makeApiErrorLike(statusCode: number, body: unknown): Record<string, unknown> {
  return {statusCode, response: {statusCode, body}}
}

const projectUserNotFoundBody = {
  error: {
    type: 'projectUserNotFoundError',
    description: 'User is not a member of this project.',
    projectID: 'abc123',
    userID: 'uXYZ',
  },
}

describe('getClientErrorStatusCode', () => {
  it('reads a top-level statusCode', () => {
    expect(getClientErrorStatusCode({statusCode: 401})).toBe(401)
  })

  it('falls back to the response statusCode', () => {
    expect(getClientErrorStatusCode({response: {statusCode: 404}})).toBe(404)
  })

  it('returns undefined for values without a status code', () => {
    expect(getClientErrorStatusCode(new Error('boom'))).toBe(undefined)
    expect(getClientErrorStatusCode(null)).toBe(undefined)
    expect(getClientErrorStatusCode('nope')).toBe(undefined)
  })
})

describe('isProjectUserNotFoundClientError', () => {
  it('recognises the error type nested under `error`', () => {
    expect(isProjectUserNotFoundClientError(makeApiErrorLike(401, projectUserNotFoundBody))).toBe(
      true,
    )
  })

  it('recognises the error type at the top level of the body', () => {
    expect(
      isProjectUserNotFoundClientError(
        makeApiErrorLike(401, {type: 'projectUserNotFoundError', description: 'nope'}),
      ),
    ).toBe(true)
  })

  it('returns false for other API error types and for non-API values', () => {
    expect(
      isProjectUserNotFoundClientError(makeApiErrorLike(401, {error: {type: 'unauthorized'}})),
    ).toBe(false)
    expect(isProjectUserNotFoundClientError(new Error('boom'))).toBe(false)
    expect(isProjectUserNotFoundClientError(undefined)).toBe(false)
  })
})

describe('getClientErrorFromCauseChain', () => {
  it('returns the error itself when it carries the API response', () => {
    const apiError = makeApiErrorLike(401, projectUserNotFoundBody)
    expect(getClientErrorFromCauseChain(apiError)).toBe(apiError)
  })

  it('finds an API error wrapped several causes deep', () => {
    const apiError = makeApiErrorLike(401, projectUserNotFoundBody)
    const wrapped = new Error('outer', {cause: new Error('inner', {cause: apiError})})
    expect(getClientErrorFromCauseChain(wrapped)).toBe(apiError)
  })

  it('returns undefined when no link in the chain is an API error', () => {
    expect(getClientErrorFromCauseChain(new Error('outer', {cause: new Error('inner')}))).toBe(
      undefined,
    )
  })

  it('does not loop forever on a circular cause chain', () => {
    const first: {cause?: unknown} = {}
    const second = {cause: first}
    first.cause = second
    expect(getClientErrorFromCauseChain(first)).toBe(undefined)
  })
})

describe('getClientErrorApiDescription', () => {
  it('reads the description from the API error body', () => {
    expect(getClientErrorApiDescription(makeApiErrorLike(401, projectUserNotFoundBody))).toBe(
      'User is not a member of this project.',
    )
  })
})

describe('shouldDeferErrorToSdk', () => {
  it('defers a 401 projectUserNotFoundError that is not an instanceof ClientError', () => {
    expect(shouldDeferErrorToSdk(makeApiErrorLike(401, projectUserNotFoundBody))).toBe(true)
  })

  it('defers the same error when an app wrapper rethrows it as a cause', () => {
    const apiError = makeApiErrorLike(401, projectUserNotFoundBody)
    expect(shouldDeferErrorToSdk(new Error('Something went wrong', {cause: apiError}))).toBe(true)
  })

  it('does not defer a 401 with a different error type', () => {
    expect(shouldDeferErrorToSdk(makeApiErrorLike(401, {error: {type: 'unauthorized'}}))).toBe(
      false,
    )
  })

  it('does not defer a projectUserNotFoundError on a non-401 status', () => {
    expect(shouldDeferErrorToSdk(makeApiErrorLike(403, projectUserNotFoundBody))).toBe(false)
  })

  it('does not defer ordinary application errors', () => {
    expect(shouldDeferErrorToSdk(new Error('render crash'))).toBe(false)
    expect(shouldDeferErrorToSdk(undefined)).toBe(false)
  })
})
