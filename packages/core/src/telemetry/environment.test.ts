import {afterEach, describe, expect, it, vi} from 'vitest'

import {getTelemetryEnvironment, isTelemetryEnabled} from './environment'

describe('getTelemetryEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe('browser', () => {
    it('returns "development" on localhost', () => {
      vi.stubGlobal('window', {location: {hostname: 'localhost'}})
      expect(getTelemetryEnvironment()).toBe('development')
    })

    it('returns "development" on 127.0.0.1', () => {
      vi.stubGlobal('window', {location: {hostname: '127.0.0.1'}})
      expect(getTelemetryEnvironment()).toBe('development')
    })

    it('returns "production" on *.sanity.studio', () => {
      vi.stubGlobal('window', {location: {hostname: 'myapp.sanity.studio'}})
      expect(getTelemetryEnvironment()).toBe('production')
    })

    it('returns "production" on www.sanity.io (dashboard)', () => {
      vi.stubGlobal('window', {location: {hostname: 'www.sanity.io'}})
      expect(getTelemetryEnvironment()).toBe('production')
    })

    it('returns "production" on www.sanity.work (staging dashboard)', () => {
      vi.stubGlobal('window', {location: {hostname: 'www.sanity.work'}})
      expect(getTelemetryEnvironment()).toBe('production')
    })

    it('returns "production" on a *.sanity.dev preview', () => {
      vi.stubGlobal('window', {location: {hostname: 'preview-123.sanity.dev'}})
      expect(getTelemetryEnvironment()).toBe('production')
    })

    it('is case-insensitive on hostname', () => {
      vi.stubGlobal('window', {location: {hostname: 'MyApp.Sanity.Studio'}})
      expect(getTelemetryEnvironment()).toBe('production')
    })

    it('returns null on a customer-controlled domain', () => {
      vi.stubGlobal('window', {location: {hostname: 'myapp.customer.com'}})
      expect(getTelemetryEnvironment()).toBeNull()
    })

    it('returns null on a lookalike domain (suffix match must be a true subdomain)', () => {
      // "notsanity.studio" should not match ".sanity.studio"
      vi.stubGlobal('window', {location: {hostname: 'evilsanity.studio'}})
      // endsWith('.sanity.studio') is false for 'evilsanity.studio' because
      // there's no leading dot — but to be safe, also test 'sanity.studio'
      // apex which lacks a subdomain prefix.
      expect(getTelemetryEnvironment()).toBeNull()
    })

    it('returns null when hostname is missing', () => {
      vi.stubGlobal('window', {location: {}})
      expect(getTelemetryEnvironment()).toBeNull()
    })

    it('returns "development" on localhost even when NODE_ENV is production', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubGlobal('window', {location: {hostname: 'localhost'}})
      expect(getTelemetryEnvironment()).toBe('development')
    })
  })

  describe('node', () => {
    it('returns "development" when NODE_ENV=development and no window', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubGlobal('window', undefined)
      expect(getTelemetryEnvironment()).toBe('development')
    })

    it('returns null when NODE_ENV=production and no window', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubGlobal('window', undefined)
      expect(getTelemetryEnvironment()).toBeNull()
    })

    it('returns null when NODE_ENV=test and no window', () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubGlobal('window', undefined)
      expect(getTelemetryEnvironment()).toBeNull()
    })
  })
})

describe('isTelemetryEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns true on a Sanity-controlled domain', () => {
    vi.stubGlobal('window', {location: {hostname: 'app.sanity.studio'}})
    expect(isTelemetryEnabled()).toBe(true)
  })

  it('returns true on localhost', () => {
    vi.stubGlobal('window', {location: {hostname: 'localhost'}})
    expect(isTelemetryEnabled()).toBe(true)
  })

  it('returns false on a customer domain', () => {
    vi.stubGlobal('window', {location: {hostname: 'myapp.example.com'}})
    expect(isTelemetryEnabled()).toBe(false)
  })
})
