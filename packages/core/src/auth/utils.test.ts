import {EMPTY, NEVER} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {AUTH_CODE_PARAM, DEFAULT_BASE} from './authConstants'
import {
  getAuthCode,
  getDefaultLocation,
  getDefaultStorage,
  getStorageEvents,
  getTokenFromStorage,
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
