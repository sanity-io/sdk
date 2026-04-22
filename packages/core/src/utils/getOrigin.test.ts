import {afterEach, describe, expect, it, vi} from 'vitest'

import {getOrigin} from './getOrigin'

describe('getOrigin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns window.location.origin when window is available', () => {
    vi.stubGlobal('window', {location: {origin: 'https://example.com'}})
    expect(getOrigin()).toBe('https://example.com')
  })

  it('returns "server" when window is undefined', () => {
    vi.stubGlobal('window', undefined)
    expect(getOrigin()).toBe('server')
  })

  it('returns "server" when window.location.origin is not a string', () => {
    vi.stubGlobal('window', {location: {}})
    expect(getOrigin()).toBe('server')
  })
})
