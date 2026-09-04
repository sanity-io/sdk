import {createHash} from 'node:crypto'

import {describe, expect, it} from 'vitest'

import {base64UrlEncode, generateCodeChallenge, generateCodeVerifier, generateState} from './pkce'

describe('base64UrlEncode', () => {
  it('encodes bytes as base64url without padding', () => {
    // 0xff 0xef 0xbf → "/++/" in base64, "_--_" in base64url (minus padding)
    const encoded = base64UrlEncode(new Uint8Array([0xff, 0xef, 0xbf]))
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).not.toContain('=')
    expect(encoded).toBe('_--_')
  })
})

describe('generateCodeVerifier / generateState', () => {
  it('generates unique, URL-safe strings', () => {
    const a = generateCodeVerifier()
    const b = generateCodeVerifier()
    const s = generateState()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.length).toBeGreaterThanOrEqual(43)
  })
})

describe('generateCodeChallenge', () => {
  it('produces base64url(sha256(verifier))', async () => {
    const verifier = 'test-verifier'
    const challenge = await generateCodeChallenge(verifier)

    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    expect(challenge).toBe(expected)
  })
})
