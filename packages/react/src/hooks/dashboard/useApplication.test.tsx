import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost, type ValueOf} from '@sanity/sdk/dashboard'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useApplication} from './useApplication'
import {type DashboardApplication} from './useApplications'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

const application = {
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

describe('useApplication', () => {
  beforeEach(() => {
    // The SDK resolves its own app ID from the CLI-embedded global.
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    host.connections.subscribe((client) =>
      client.emit('applications.list', {
        ok: true,
        value: [application],
      } as ValueOf<'applications.list'>),
    )
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('returns an application by id or null', () => {
    const {result, rerender} = renderHook(({applicationId}) => useApplication(applicationId), {
      initialProps: {applicationId: application.id},
    })

    expectTypeOf(result.current).toEqualTypeOf<DashboardApplication | null>()
    expect(result.current?.id).toBe(application.id)

    rerender({applicationId: 'missing'})
    expect(result.current).toBeNull()
  })

  it('returns an application by slug', () => {
    const {result} = renderHook(() => useApplication(application.slug))
    expect(result.current?.id).toBe(application.id)
  })

  it("returns the application with a matching id when another application's slug equals that id", () => {
    host.connections.subscribe((client) =>
      client.emit('applications.list', {
        ok: true,
        value: [{...application, id: 'application-2', slug: application.id}, application],
      } as ValueOf<'applications.list'>),
    )

    const {result} = renderHook(() => useApplication(application.id))
    expect(result.current?.id).toBe(application.id)
  })
})
