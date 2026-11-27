import {describe, expect, it} from 'vitest'

import {type Application, type ApplicationInclude} from '../applications/applications'
import {type Installation, type InstallationInclude} from '../installations/installations'
import {toDashboardViews} from './applications'

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
        id: 'panel-1',
        type: 'panel',
        name: 'notifications',
        title: 'Notifications',
        version: '1',
        moduleId: 'views/notifications',
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
    organizationId: 'organization-publisher',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  interfaces: [
    {
      id: 'remote-tile-1',
      type: 'tile',
      name: 'summary',
      title: 'Summary',
      version: '2',
      moduleId: 'views/summary',
      metadata: {size: 'small'},
    },
  ],
} satisfies Installation<InstallationInclude>

describe('toDashboardViews', () => {
  it('lists every view with the application it belongs to, without web workers', () => {
    expect(toDashboardViews([application, installation])).toStrictEqual([
      {
        id: 'panel-1',
        surface: 'panel',
        name: 'notifications',
        title: 'Notifications',
        version: '1',
        moduleId: 'views/notifications',
        metadata: null,
        entry: 'https://inbox--apps--organization-1.sanity.run',
        application: {...application, isLocal: false},
      },
      {
        id: 'remote-tile-1',
        surface: 'tile',
        name: 'summary',
        title: 'Summary',
        version: '2',
        moduleId: 'views/summary',
        metadata: {size: 'small'},
        entry: 'https://remote--apps--organization-publisher.sanity.run',
        application: {
          id: 'installation-1',
          type: 'installation',
          title: 'Remote App',
          name: 'remote',
          reference: 'sanity/remote',
          icon: null,
          isSingleton: true,
          visibility: 'default',
          slug: 'remote',
          externalUrl: null,
          organizationId: 'organization-publisher',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          installation,
        },
      },
    ])
  })
})
