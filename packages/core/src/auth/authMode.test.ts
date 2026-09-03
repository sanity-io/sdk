import {describe, expect, it} from 'vitest'

import {type SanityConfig} from '../config/sanityConfig'
import {isStudioConfig, resolveAuthMode} from './authMode'

describe('resolveAuthMode', () => {
  it('returns "studio" when studio config is provided', () => {
    const config: SanityConfig = {studio: {}}
    expect(resolveAuthMode(config, 'https://example.com')).toBe('studio')
  })

  it('returns "dashboard" when _context URL param has a non-empty JSON object', () => {
    const context = encodeURIComponent(JSON.stringify({orgId: '123'}))
    const href = `https://example.com?_context=${context}`
    expect(resolveAuthMode({}, href)).toBe('dashboard')
  })

  it('returns "standalone" by default', () => {
    expect(resolveAuthMode({}, 'https://example.com')).toBe('standalone')
  })

  it('returns "oauth" when auth.oauth config is provided', () => {
    const config: SanityConfig = {
      auth: {oauth: {clientId: 'c', redirectUri: 'https://app/cb', organizationId: 'o'}},
    }
    expect(resolveAuthMode(config, 'https://example.com')).toBe('oauth')
  })

  it('prefers "oauth" over dashboard context detection', () => {
    const context = encodeURIComponent(JSON.stringify({orgId: '123'}))
    const href = `https://example.com?_context=${context}`
    const config: SanityConfig = {
      auth: {oauth: {clientId: 'c', redirectUri: 'https://app/cb', organizationId: 'o'}},
    }
    expect(resolveAuthMode(config, href)).toBe('oauth')
  })

  it('prefers "studio" over oauth config', () => {
    const config: SanityConfig = {
      studio: {},
      auth: {oauth: {clientId: 'c', redirectUri: 'https://app/cb', organizationId: 'o'}},
    }
    expect(resolveAuthMode(config, 'https://example.com')).toBe('studio')
  })
})

describe('isStudioConfig', () => {
  it('returns true when studio config is provided', () => {
    expect(isStudioConfig({studio: {}})).toBe(true)
  })

  it('returns false for empty config', () => {
    expect(isStudioConfig({})).toBe(false)
  })
})
