import {
  type Application,
  type ApplicationInclude,
  type Installation,
  type InstallationInclude,
} from '@sanity/sdk'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {
  type LocalApplication,
  type MessageBusHost,
  TopicError,
  type ValueOf,
} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, renderHook, screen} from '../../../test/test-utils'
import {type DashboardApplication, useApplications} from './useApplications'

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
        id: 'tile-1',
        type: 'tile',
        name: 'summary',
        title: 'Summary',
        version: '1',
        moduleId: 'views/summary',
        metadata: {size: 'small'},
      },
      {
        id: 'asset-source-1',
        type: 'asset_source',
        name: 'library',
        title: 'Library',
        version: '1',
        moduleId: 'views/library',
        metadata: null,
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
} satisfies Application<ApplicationInclude>

const nonFederatedApplication = {
  ...application,
  id: 'application-2',
  name: 'legacy',
  reference: 'organization-1/legacy',
  slug: 'legacy',
  title: 'Legacy',
  isSingleton: false,
  config: {},
} satisfies Application<ApplicationInclude>

const nonSingletonApplication = {
  ...application,
  id: 'application-3',
  name: 'canvas',
  reference: 'organization-1/canvas',
  slug: 'canvas',
  title: 'Canvas',
  isSingleton: false,
} satisfies Application<ApplicationInclude>

const externalApplication = {
  ...application,
  id: 'application-4',
  name: 'external',
  slug: null,
  externalUrl: 'https://apps.example.com/external/index.html',
} satisfies Application<ApplicationInclude>

// The workbench synthesises a dev-server app into the deployed shape and marks it with `local`.
const localApplication = {
  ...application,
  id: 'application-5',
  name: 'dev',
  slug: null,
  isSingleton: false,
  externalUrl: 'http://localhost:3333',
  organizationId: 'local',
  local: {host: 'localhost', port: 3333},
} satisfies LocalApplication

const installation = {
  id: 'installation-1',
  applicationId: 'app-remote-1',
  organizationId: 'organization-1',
  installedBy: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  application: {
    title: 'Remote App',
    name: 'remote',
    reference: 'sanity/remote',
    slug: 'remote',
    icon: null,
    // Distinct from the installing org: the bundle is hosted under the publisher's org.
    organizationId: 'organization-publisher',
  },
  interfaces: [
    {
      id: 'remote-view-1',
      type: 'app',
      name: 'remote',
      title: 'Remote App',
      version: '1',
      moduleId: 'App',
      metadata: null,
    },
    {
      id: 'remote-panel-1',
      type: 'panel',
      name: 'remote-panel',
      title: 'Remote Panel',
      version: '1',
      moduleId: 'views/panel',
      metadata: null,
    },
  ],
} satisfies Installation<InstallationInclude>

const emitApplications = (value: unknown[]) =>
  host.connections.subscribe((client) =>
    client.emit('applications.list', {ok: true, value} as ValueOf<'applications.list'>),
  )

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

  it('returns full applications with loadable views and web workers', () => {
    emitApplications([application, nonFederatedApplication, nonSingletonApplication])

    const {result} = renderHook(() => useApplications())

    expectTypeOf(result.current).toEqualTypeOf<DashboardApplication[]>()
    // The application member keeps its raw deployment fields; the union also admits installations.
    expectTypeOf<
      Extract<
        keyof Exclude<DashboardApplication, {type: 'installation'}>,
        'activeDeployment' | 'config'
      >
    >().toEqualTypeOf<'activeDeployment' | 'config'>()
    const [federated, nonFederated, nonSingleton] = result.current
    expect(federated).toMatchObject({
      activeDeployment: {id: 'deployment-1'},
      config: {mfManifest: {}},
    })
    expect(federated?.views[0]?.application).not.toHaveProperty('activeDeployment')
    expect(federated?.views[0]?.application).not.toHaveProperty('config')
    expect(federated?.webWorkers[0]?.application).not.toHaveProperty('activeDeployment')
    expect(federated?.webWorkers[0]?.application).not.toHaveProperty('config')
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
      expect.objectContaining({name: 'summary', surface: 'tile'}),
      expect.objectContaining({name: 'library', surface: 'asset_source'}),
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
    expect(result.current.map(({isLocal}) => isLocal)).toEqual([false, false, false])
  })

  it('marks dev-server applications local and loads their modules from the dev server', () => {
    emitApplications([application, localApplication, installation])

    const {result} = renderHook(() => useApplications())

    expect(result.current.map(({id, isLocal}) => [id, isLocal])).toEqual([
      ['application-1', false],
      ['application-5', true],
      ['installation-1', false],
    ])
    const local = result.current[1]
    expect(local).toMatchObject({type: 'coreApp', local: {host: 'localhost', port: 3333}})
    expect(local?.views[0]?.module.entry).toBe('http://localhost:3333')
    expect(local?.views[0]?.application).toMatchObject({id: 'application-5', isLocal: true})
  })

  it('shapes installations alongside applications in one consistent shape', () => {
    emitApplications([application, installation])

    const {result} = renderHook(() => useApplications())

    const shaped = result.current.find(({id}) => id === 'installation-1')
    expect(shaped).toMatchObject({
      id: 'installation-1',
      type: 'installation',
      title: 'Remote App',
      name: 'remote',
      reference: 'sanity/remote',
      slug: 'remote',
      icon: null,
      isSingleton: true,
      visibility: 'default',
      externalUrl: null,
      organizationId: 'organization-publisher',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      installation,
    })
    // Raw record fields must not leak onto the shaped entry, nor the raw record onto its views.
    expect(shaped).not.toHaveProperty('applicationId')
    expect(shaped).not.toHaveProperty('installedBy')
    expect(shaped?.views[0]?.application).not.toHaveProperty('installation')
    expect(shaped?.views).toEqual([
      expect.objectContaining({
        name: 'remote',
        surface: 'window',
        module: {
          entry: 'https://remote-apps-organization-publisher.sanity.run',
          moduleId: 'installation-1/App',
          version: '1',
        },
      }),
      expect.objectContaining({
        name: 'remote-panel',
        surface: 'panel',
        module: expect.objectContaining({moduleId: 'installation-1/views/panel'}),
      }),
    ])
    expect(shaped?.webWorkers).toEqual([])
  })

  it('exposes no views for an installation without interfaces', () => {
    const {interfaces: _interfaces, ...withoutInterfaces} = installation
    emitApplications([withoutInterfaces])

    const {result} = renderHook(() => useApplications())

    expect(result.current[0]).toMatchObject({id: 'installation-1', views: [], webWorkers: []})
  })

  it('exposes no views for an installation without a slug to derive an origin from', () => {
    emitApplications([{...installation, application: {...installation.application, slug: null}}])

    const {result} = renderHook(() => useApplications())

    expect(result.current[0]).toMatchObject({id: 'installation-1', views: [], webWorkers: []})
  })

  it('loads a dev-server application without a module federation manifest', () => {
    const {config: _config, ...withoutManifest} = localApplication
    emitApplications([withoutManifest])

    const {result} = renderHook(() => useApplications())

    expect(result.current[0]?.views.map(({name}) => name)).toEqual([
      'inbox',
      'notifications',
      'summary',
      'library',
    ])
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

  it('exposes no views or web workers for an application without a resolvable origin', () => {
    // One bad record must not take the whole list down for every consumer.
    const unaddressable = {...application, id: 'application-5', slug: null, externalUrl: null}
    vi.spyOn(console, 'error').mockImplementation(() => {})
    emitApplications([unaddressable, nonSingletonApplication])

    const {result} = renderHook(() => useApplications())

    expect(result.current.map(({id, views, webWorkers}) => ({id, views, webWorkers}))).toEqual([
      {id: 'application-5', views: [], webWorkers: []},
      expect.objectContaining({id: 'application-3'}),
    ])
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
    host.connections.subscribe((client) => client.emit('applications.list', null))

    const {result} = renderHook(() => useApplications())

    expect(result.current).toEqual([])
  })

  it('throws a TopicError to the error boundary when the dashboard fails to load applications', () => {
    host.connections.subscribe((client) => client.emit('applications.list', {ok: false}))
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
