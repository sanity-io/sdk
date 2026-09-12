import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBus, type ValueOf} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, renderHook, screen} from '../../../test/test-utils'
import {type Application, useApplications} from './useApplications'
import {TopicError} from './useTopic'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBus

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
  config: {mfManifest: {}},
  activeDeployment: {
    id: 'deployment-1',
    applicationId: 'application-1',
    size: 100,
    version: '1.0.0',
    isAutoUpdating: false,
    isActiveDeployment: true,
    deployedBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    interfaces: [
      {
        id: 'view-1',
        type: 'app',
        name: 'inbox',
        title: 'Inbox',
        version: '1',
        moduleId: 'App',
        metadata: null,
      },
      {
        id: 'panel-1',
        type: 'panel',
        name: 'notifications',
        title: 'Notifications',
        version: '1',
        moduleId: 'views/notifications',
        metadata: {dock: {group: 'dock.applications', order: 1}},
      },
      {
        id: 'worker-1',
        type: 'worker',
        name: 'sync',
        title: 'Sync',
        version: '1',
        moduleId: 'services/sync',
        metadata: null,
      },
    ],
  },
}

const nonFederatedApplication = {
  ...application,
  id: 'application-2',
  name: 'legacy',
  reference: 'organization-1/legacy',
  slug: 'legacy',
  title: 'Legacy',
  isSingleton: false,
  config: {},
}

const nonSingletonApplication = {
  ...application,
  id: 'application-3',
  name: 'canvas',
  reference: 'organization-1/canvas',
  slug: 'canvas',
  title: 'Canvas',
  isSingleton: false,
}

const externalApplication = {
  ...application,
  id: 'application-4',
  name: 'external',
  slug: null,
  externalUrl: 'https://apps.example.com/external/index.html',
}

const emitApplications = (value: unknown[]) =>
  host.emit('applications.list', {ok: true, value} as ValueOf<'applications.list'>)

describe('useApplications', () => {
  beforeEach(() => {
    // The SDK resolves its own app ID from the CLI-embedded global.
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns minimal applications with loadable views and web workers', () => {
    emitApplications([application, nonFederatedApplication, nonSingletonApplication])

    const {result} = renderHook(() => useApplications())

    expectTypeOf(result.current).toEqualTypeOf<Application[]>()
    const [federated, nonFederated, nonSingleton] = result.current
    expect(federated).not.toHaveProperty('activeDeployment')
    expect(federated).not.toHaveProperty('config')
    expect(federated?.views).toEqual([
      expect.objectContaining({
        application: expect.objectContaining({id: 'application-1'}),
        module: {
          entry: 'https://inbox-apps-organization-1.sanity.run',
          moduleId: 'application-1/App',
          version: '1',
        },
        name: 'inbox',
        surface: 'window',
      }),
      expect.objectContaining({
        module: expect.objectContaining({moduleId: 'application-1/views/notifications'}),
        name: 'notifications',
        surface: 'panel',
      }),
    ])
    expect(federated?.webWorkers).toEqual([
      expect.objectContaining({
        module: expect.objectContaining({moduleId: 'application-1/services/sync'}),
        name: 'sync',
        type: 'worker',
      }),
    ])
    expect(nonFederated).toMatchObject({views: [], webWorkers: []})
    expect(nonSingleton?.views[0]?.module.entry).toBe('https://canvas.sanity.studio')
  })

  it('follows topic updates without remapping unchanged lists', () => {
    emitApplications([application])
    const {result, rerender} = renderHook(() => useApplications())
    const first = result.current

    rerender()
    expect(result.current).toBe(first)

    act(() => emitApplications([application, nonSingletonApplication]))
    expect(result.current.map(({id}) => id)).toEqual(['application-1', 'application-3'])
  })

  it('hosts external application modules at their external origin', () => {
    emitApplications([externalApplication])

    const {result} = renderHook(() => useApplications())

    expect(result.current[0]?.views[0]?.module.entry).toBe('https://apps.example.com')
  })

  it('uses the staging application origin', () => {
    vi.stubGlobal('__SANITY_STAGING__', true)
    emitApplications([application, nonSingletonApplication])

    const {result} = renderHook(() => useApplications())

    expect(result.current.map(({views}) => views[0]?.module.entry)).toEqual([
      'https://inbox-apps-organization-1.run.sanity.work',
      'https://canvas.studio.sanity.work',
    ])
  })

  it('returns an empty list when the dashboard clears its applications', () => {
    host.emit('applications.list', null)

    const {result} = renderHook(() => useApplications())

    expect(result.current).toEqual([])
  })

  it('throws a TopicError to the error boundary when the dashboard fails to load applications', () => {
    host.emit('applications.list', {ok: false})
    const onError = vi.fn()

    function Applications() {
      return <span>{useApplications().length} applications</span>
    }

    render(
      <ErrorBoundary fallback={<span>Failed</span>} onError={onError}>
        <Suspense fallback="Loading">
          <Applications />
        </Suspense>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(TopicError)
  })
})
