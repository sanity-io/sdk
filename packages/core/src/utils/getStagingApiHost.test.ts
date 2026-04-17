import {describe, expect, it, vi} from 'vitest'

import {getStagingApiHost} from './getStagingApiHost'

describe('getStagingApiHost', () => {
  it('returns staging host when __SANITY_STAGING__ is true', () => {
    vi.stubGlobal('__SANITY_STAGING__', true)
    expect(getStagingApiHost()).toBe('https://api.sanity.work')
    vi.unstubAllGlobals()
  })

  it('returns undefined when __SANITY_STAGING__ is false', () => {
    vi.stubGlobal('__SANITY_STAGING__', false)
    expect(getStagingApiHost()).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('returns undefined when __SANITY_STAGING__ is not defined', () => {
    expect(getStagingApiHost()).toBeUndefined()
  })
})
