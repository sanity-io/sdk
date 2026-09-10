import {afterEach, describe, expect, it, vi} from 'vitest'

import {randomId, randomUuid} from './ids'

describe('randomId', () => {
  it('should generate an 8-character base62 id by default', () => {
    expect(randomId()).toMatch(/^[a-zA-Z0-9]{8}$/)
  })

  it('should generate an id of the given length', () => {
    expect(randomId(16)).toMatch(/^[a-zA-Z0-9]{16}$/)
  })

  it('should generate different ids on each call', () => {
    expect(randomId()).not.toBe(randomId())
  })
})

describe('randomUuid', () => {
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should generate a v4 UUID', () => {
    expect(randomUuid()).toMatch(uuidV4Pattern)
  })

  it('should use crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', {randomUUID: () => 'native-uuid'})
    expect(randomUuid()).toBe('native-uuid')
  })

  it('should generate a v4 UUID when crypto.randomUUID is unavailable (insecure contexts)', () => {
    const originalCrypto = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array<ArrayBuffer>) => originalCrypto.getRandomValues(array),
    })
    expect(randomUuid()).toMatch(uuidV4Pattern)
  })

  it('should generate unique ids when crypto.randomUUID is unavailable', () => {
    const originalCrypto = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array<ArrayBuffer>) => originalCrypto.getRandomValues(array),
    })
    const ids = new Set(Array.from({length: 100}, () => randomUuid()))
    expect(ids.size).toBe(100)
  })
})
