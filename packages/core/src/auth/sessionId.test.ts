import {describe, expect, it} from 'vitest'

import {getSidUrlSearch} from './sessionId'

describe('getSidUrlHash', () => {
  it('returns null for non-browser environments', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getSidUrlSearch(undefined as any)).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getSidUrlSearch(null as any)).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getSidUrlSearch('not-an-object' as any)).toBeNull()
  })

  it('returns null when no sid parameter exists', () => {
    const mockLocation = {
      search: '?foo=bar',
      href: 'http://example.com?foo=bar',
    } as Location
    expect(getSidUrlSearch(mockLocation)).toBeNull()
  })

  it('returns null when sid parameter is too short', () => {
    const mockLocation = {
      search: '?sid=abc123&foo=bar',
      href: 'http://example.com?sid=abc123&foo=bar',
    } as Location
    expect(getSidUrlSearch(mockLocation)).toBeNull()
  })

  it('extracts valid session ID from URL search', () => {
    const validSid = 'abcdef1234567890abcdef'
    const mockLocation = {
      search: `?sid=${validSid}&foo=bar`,
      href: `http://example.com?sid=${validSid}&foo=bar`,
    } as Location
    expect(getSidUrlSearch(mockLocation)).toBe(validSid)
  })

  it('handles sid parameter at the end of search', () => {
    const validSid = 'abcdef1234567890abcdef'
    const mockLocation = {
      search: `?foo=bar&sid=${validSid}`,
      href: `http://example.com?foo=bar&sid=${validSid}`,
    } as Location
    expect(getSidUrlSearch(mockLocation)).toBe(validSid)
  })

  it('handles sid parameter as the only search parameter', () => {
    const validSid = 'abcdef1234567890abcdef'
    const mockLocation = {
      search: `?sid=${validSid}`,
      href: `http://example.com?sid=${validSid}`,
    } as Location
    expect(getSidUrlSearch(mockLocation)).toBe(validSid)
  })
})
