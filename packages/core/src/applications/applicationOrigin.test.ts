import {afterEach, describe, expect, it, vi} from 'vitest'

import {getApplicationOrigin} from './applicationOrigin'
import {type ApplicationBase} from './applications'

const application: ApplicationBase = {
  id: 'application-1',
  type: 'coreApp',
  title: 'Inbox',
  name: 'inbox',
  reference: 'sanity/inbox',
  icon: null,
  isSingleton: true,
  visibility: 'default',
  slug: 'inbox',
  externalUrl: null,
  organizationId: 'organization-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

describe('getApplicationOrigin', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('serves singletons from the organization address, and apps without isLegacy (older Dashboards) from their slug', () => {
    expect(getApplicationOrigin(application)).toBe('https://inbox--apps--organization-1.sanity.run')
    expect(getApplicationOrigin({...application, isSingleton: false, slug: 'canvas'})).toBe(
      'https://canvas.sanity.studio',
    )
  })

  it('serves custom apps from the organization address and studios and legacy apps from their slug', () => {
    const custom = {...application, isSingleton: false, isLegacy: false, slug: 'marketing'}
    expect(getApplicationOrigin(custom)).toBe('https://marketing--apps--organization-1.sanity.run')
    expect(getApplicationOrigin({...custom, isLegacy: true})).toBe(
      'https://marketing.sanity.studio',
    )
    expect(getApplicationOrigin({...custom, type: 'studio'})).toBe(
      'https://marketing.sanity.studio',
    )

    vi.stubGlobal('__SANITY_STAGING__', true)
    expect(getApplicationOrigin(custom)).toBe(
      'https://marketing--apps--organization-1.run.sanity.work',
    )
  })

  it('accepts the installation shape Studio builds by hand, without a type (a type-check guard)', () => {
    expect(
      getApplicationOrigin({
        externalUrl: null,
        slug: 'inbox',
        isSingleton: true,
        organizationId: 'organization-1',
      }),
    ).toBe('https://inbox--apps--organization-1.sanity.run')
  })

  it('uses the staging domains when the host sets the runtime flag', () => {
    vi.stubGlobal('__SANITY_STAGING__', true)
    expect(getApplicationOrigin(application)).toBe(
      'https://inbox--apps--organization-1.run.sanity.work',
    )
    expect(getApplicationOrigin({...application, isSingleton: false})).toBe(
      'https://inbox.studio.sanity.work',
    )
  })

  it('prefers the external URL origin and returns null without slug or URL', () => {
    expect(
      getApplicationOrigin({
        ...application,
        externalUrl: 'https://apps.example.com/external/index.html',
      }),
    ).toBe('https://apps.example.com')
    expect(getApplicationOrigin({...application, slug: null})).toBeNull()
  })
})
