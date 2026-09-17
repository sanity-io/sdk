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

  it('derives singleton and organization origins from the slug', () => {
    expect(getApplicationOrigin(application)).toBe('https://inbox-apps-organization-1.sanity.run')
    expect(getApplicationOrigin({...application, isSingleton: false, slug: 'canvas'})).toBe(
      'https://canvas.sanity.studio',
    )
  })

  it('uses the staging domains when the host sets the runtime flag', () => {
    vi.stubGlobal('__SANITY_STAGING__', true)
    expect(getApplicationOrigin(application)).toBe(
      'https://inbox-apps-organization-1.run.sanity.work',
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
