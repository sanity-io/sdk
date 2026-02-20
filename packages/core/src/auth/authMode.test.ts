import {describe, expect, it} from 'vitest'

import {type SanityConfig} from '../config/sanityConfig'
import {isStudioConfig, resolveAuthMode} from './authMode'

describe('resolveAuthMode', () => {
  it('returns "studio" when studio config is provided', () => {
    const config: SanityConfig = {studio: {}}
    expect(resolveAuthMode(config, 'https://example.com')).toBe('studio')
  })

  it('returns "studio" when deprecated studioMode.enabled is true', () => {
    const config: SanityConfig = {studioMode: {enabled: true}}
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

  it('prefers studio config over studioMode', () => {
    const config: SanityConfig = {
      studio: {},
      studioMode: {enabled: true},
    }
    expect(resolveAuthMode(config, 'https://example.com')).toBe('studio')
  })
})

describe('isStudioConfig', () => {
  it('returns true when studio config is provided', () => {
    expect(isStudioConfig({studio: {}})).toBe(true)
  })

  it('returns true when deprecated studioMode.enabled is true', () => {
    expect(isStudioConfig({studioMode: {enabled: true}})).toBe(true)
  })

  it('returns false when studioMode.enabled is false', () => {
    expect(isStudioConfig({studioMode: {enabled: false}})).toBe(false)
  })

  it('returns false for empty config', () => {
    expect(isStudioConfig({})).toBe(false)
  })

  it('returns true when both studio and studioMode are present', () => {
    expect(isStudioConfig({studio: {}, studioMode: {enabled: true}})).toBe(true)
  })
})
