import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {type ValueOf} from '../../dashboard/messageBus/topics'
import {type Application, useApplications} from './useApplications'
import {TopicError, type UseTopicResult} from './useTopic'

const mocks = vi.hoisted(() => ({
  client: undefined as MessageBus | undefined,
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.client,
}))

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

const emitApplications = (value: unknown[]) =>
  mocks.client?.emit('applications.list', {ok: true, value} as ValueOf<'applications.list'>)

describe('dashboard applications', () => {
  beforeEach(() => {
    mocks.client = createIsolatedMessageBus('dashboard')
  })

  it('returns minimal applications with loadable views and web workers', () => {
    const {result} = renderHook(() => useApplications({suspend: false}))

    expectTypeOf(result.current).toEqualTypeOf<UseTopicResult<Application[], false, TopicError>>()
    expect(result.current).toEqual({data: undefined, isPending: true})

    act(() => emitApplications([application, nonFederatedApplication, nonSingletonApplication]))

    expect(result.current.isPending).toBe(false)
    if (result.current.isPending || result.current.error) throw new Error('expected applications')

    const [federated, nonFederated, nonSingleton] = result.current.data
    expect(federated).not.toHaveProperty('activeDeployment')
    expect(federated).not.toHaveProperty('config')
    expect(federated?.views).toEqual([
      expect.objectContaining({
        application: expect.objectContaining({id: 'application-1'}),
        module: {
          entry: 'https://inbox-apps-organization-1.sanity.run/mf-manifest.json',
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
    expect(nonSingleton?.views[0]?.module.entry).toBe(
      'https://canvas-apps-organization-1.sanity.run/mf-manifest.json',
    )
  })

  it('uses the staging application origin', () => {
    vi.stubGlobal('__SANITY_STAGING__', true)
    const {result} = renderHook(() => useApplications({suspend: false}))

    act(() => emitApplications([nonSingletonApplication]))

    expect(result.current.data?.[0]?.views[0]?.module.entry).toBe(
      'https://canvas-apps-organization-1.run.sanity.work/mf-manifest.json',
    )
    vi.unstubAllGlobals()
  })

  it('returns an empty list when the dashboard clears its applications', () => {
    mocks.client?.emit('applications.list', null)

    const {result} = renderHook(() => useApplications({suspend: false}))

    expect(result.current).toEqual({data: [], isPending: false})
  })

  it('returns an error when the dashboard fails to load applications', () => {
    mocks.client?.emit('applications.list', {ok: false})

    const {result} = renderHook(() => useApplications({suspend: false}))

    expect(result.current).toEqual({
      error: new TopicError('applications.list'),
      isPending: false,
    })
  })
})
