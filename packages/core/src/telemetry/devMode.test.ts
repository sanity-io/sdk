import {afterEach, describe, expect, it, vi} from 'vitest'

import {isDevMode} from './devMode'

describe('isDevMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns false when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubGlobal('window', undefined)
    expect(isDevMode()).toBe(false)
  })

  it('returns true when running on localhost', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubGlobal('window', {
      location: {href: 'http://localhost:3000/'},
    })
    expect(isDevMode()).toBe(true)
  })

  it('returns true when running on 127.0.0.1', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubGlobal('window', {
      location: {href: 'http://127.0.0.1:3000/'},
    })
    expect(isDevMode()).toBe(true)
  })

  it('returns false for a non-local URL', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubGlobal('window', {
      location: {href: 'https://myapp.sanity.studio/'},
    })
    expect(isDevMode()).toBe(false)
  })

  it('returns true when NODE_ENV is development and no window', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubGlobal('window', undefined)
    expect(isDevMode()).toBe(true)
  })

  it('returns false when NODE_ENV is test and no window', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubGlobal('window', undefined)
    expect(isDevMode()).toBe(false)
  })
})
