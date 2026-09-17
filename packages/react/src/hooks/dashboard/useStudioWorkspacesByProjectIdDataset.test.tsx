import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost, TopicError, type ValueOf} from '@sanity/sdk/dashboard'
import {renderHook, waitFor} from '@testing-library/react'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {render, renderHook as renderHookWithInstance, screen} from '../../../test/test-utils'
import {useWindowConnection} from '../comlink/useWindowConnection'
import {useStudioWorkspacesByProjectIdDataset} from './useStudioWorkspacesByProjectIdDataset'

vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

const mockWorkspaceData = {
  context: {
    availableResources: [
      {
        id: 'user1-workspace1',
        projectId: 'project1',
        dataset: 'dataset1',
        name: 'workspace1',
        title: 'Workspace 1',
        basePath: '/workspace1',
        userApplicationId: 'user1',
        url: 'https://test1.sanity.studio',
        type: 'studio',
      },
      {
        id: 'user1-workspace2',
        projectId: 'project1',
        dataset: 'dataset1',
        name: 'workspace2',
        title: 'Workspace 2',
        basePath: '/workspace2',
        userApplicationId: 'user1',
        url: 'https://test2.sanity.studio',
        type: 'studio',
      },
      {
        id: 'user2-workspace3',
        projectId: 'project2',
        dataset: 'dataset2',
        name: 'workspace3',
        title: 'Workspace 3',
        basePath: '/workspace3',
        userApplicationId: 'user2',
        url: 'https://test3.sanity.studio',
        type: 'studio',
      },
    ],
  },
}

describe('useStudioWorkspacesByResourceId', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should process workspaces into lookup by projectId:dataset', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockWorkspaceData)
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    await waitFor(() => {
      expect(result.current.workspacesByProjectIdAndDataset).toEqual({
        'project1:dataset1': [
          {
            id: 'user1-workspace1',
            projectId: 'project1',
            dataset: 'dataset1',
            name: 'workspace1',
            title: 'Workspace 1',
            basePath: '/workspace1',
            userApplicationId: 'user1',
            url: 'https://test1.sanity.studio',
            type: 'studio',
          },
          {
            id: 'user1-workspace2',
            projectId: 'project1',
            dataset: 'dataset1',
            name: 'workspace2',
            title: 'Workspace 2',
            basePath: '/workspace2',
            userApplicationId: 'user1',
            url: 'https://test2.sanity.studio',
            type: 'studio',
          },
        ],
        'project2:dataset2': [
          {
            id: 'user2-workspace3',
            projectId: 'project2',
            dataset: 'dataset2',
            name: 'workspace3',
            title: 'Workspace 3',
            basePath: '/workspace3',
            userApplicationId: 'user2',
            url: 'https://test3.sanity.studio',
            type: 'studio',
          },
        ],
      })
      expect(result.current.error).toBeNull()
    })

    expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/context', undefined, expect.any(Object))
  })

  it('should handle fetch errors', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    await waitFor(() => {
      expect(result.current.workspacesByProjectIdAndDataset).toEqual({})
      expect(result.current.error).toBe('Failed to fetch workspaces')
    })
  })

  it('should handle AbortError silently', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    const mockFetch = vi.fn().mockRejectedValue(abortError)
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    await waitFor(() => {
      expect(result.current.workspacesByProjectIdAndDataset).toEqual({})
      expect(result.current.error).toBeNull()
    })
  })

  it('should filter non-studio resources and handle resources without projectId/dataset', async () => {
    const mockDataWithMixedResources = {
      context: {
        availableResources: [
          {
            id: 'studio1',
            projectId: 'project1',
            dataset: 'dataset1',
            name: 'workspace1',
            title: 'Workspace 1',
            basePath: '/workspace1',
            userApplicationId: 'user1',
            url: 'https://test1.sanity.studio',
            type: 'studio',
          },
          {
            id: 'non-studio',
            projectId: 'project2',
            dataset: 'dataset2',
            name: 'non-studio',
            title: 'Non Studio Resource',
            basePath: '/non-studio',
            userApplicationId: 'user2',
            url: 'https://test2.sanity.studio',
            type: 'other',
          },
          {
            id: 'studio-no-project',
            name: 'incomplete-workspace',
            title: 'Incomplete Workspace',
            basePath: '/incomplete',
            userApplicationId: 'user3',
            url: 'https://test3.sanity.studio',
            type: 'studio',
          },
          {
            id: 'studio-no-dataset',
            projectId: 'project3',
            name: 'no-dataset-workspace',
            title: 'No Dataset Workspace',
            basePath: '/no-dataset',
            userApplicationId: 'user4',
            url: 'https://test4.sanity.studio',
            type: 'studio',
          },
        ],
      },
    }
    const mockFetch = vi.fn().mockResolvedValue(mockDataWithMixedResources)
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    await waitFor(() => {
      // Should only include the studio resource with valid projectId and dataset
      expect(result.current.workspacesByProjectIdAndDataset['project1:dataset1']).toHaveLength(1)
      expect(result.current.workspacesByProjectIdAndDataset['project1:dataset1'][0].id).toBe(
        'studio1',
      )

      // Should not include the non-studio resource
      expect(result.current.workspacesByProjectIdAndDataset['project2:dataset2']).toBeUndefined()

      // Should group resources without projectId or dataset under NO_PROJECT_ID:NO_DATASET
      expect(
        result.current.workspacesByProjectIdAndDataset['NO_PROJECT_ID:NO_DATASET'],
      ).toHaveLength(2)
      expect(
        result.current.workspacesByProjectIdAndDataset['NO_PROJECT_ID:NO_DATASET'].map((r) => r.id),
      ).toEqual(['studio-no-project', 'studio-no-dataset'])

      expect(result.current.error).toBeNull()
    })
  })
})

describe('useStudioWorkspacesByProjectIdDataset (message bus)', () => {
  const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
  let host: MessageBusHost

  const deployment = {
    id: 'deployment-1',
    applicationId: 'studio-1',
    size: null,
    version: '4.0.0',
    isAutoUpdating: true,
    isActiveDeployment: true,
    deployedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    interfaces: [],
  }

  const workspace = {
    id: 'workspace-1',
    name: 'production',
    title: 'Production',
    subtitle: null,
    projectId: 'project1',
    dataset: 'dataset1',
    schemaDescriptorId: null,
    basePath: '/production',
    icon: null,
  }

  const studio = {
    id: 'studio-1',
    type: 'studio',
    title: 'My Studio',
    name: 'my-studio',
    reference: 'organization-1/my-studio',
    icon: null,
    isSingleton: false,
    visibility: 'default',
    slug: 'my-studio',
    externalUrl: null,
    organizationId: 'organization-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    config: {},
    activeDeployment: {
      ...deployment,
      workspaces: [
        workspace,
        {...workspace, id: 'workspace-2', name: 'staging', title: null, basePath: null},
        {...workspace, id: 'workspace-3', projectId: 'project2', dataset: 'dataset2'},
      ],
    },
  }

  const coreApp = {
    ...studio,
    id: 'app-1',
    type: 'coreApp',
    activeDeployment: {...deployment, applicationId: 'app-1', workspaces: [workspace]},
  }

  const emitApplications = (value: unknown[] | null) =>
    host.connections.subscribe((client) =>
      client.emit(
        'applications.list',
        (value === null ? null : {ok: true, value}) as ValueOf<'applications.list'>,
      ),
    )

  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('maps studio workspaces to resources keyed by projectId:dataset', () => {
    emitApplications([studio, coreApp])

    const {result} = renderHookWithInstance(() => useStudioWorkspacesByProjectIdDataset())

    expect(useWindowConnection).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
    expect(result.current.workspacesByProjectIdAndDataset).toEqual({
      'project1:dataset1': [
        {
          id: 'workspace-1',
          name: 'production',
          title: 'Production',
          basePath: '/production',
          projectId: 'project1',
          dataset: 'dataset1',
          type: 'studio',
          userApplicationId: 'studio-1',
          url: 'https://my-studio.sanity.studio',
        },
        expect.objectContaining({id: 'workspace-2', title: 'My Studio', basePath: ''}),
      ],
      'project2:dataset2': [expect.objectContaining({id: 'workspace-3'})],
    })
  })

  it('returns an empty map when the dashboard clears its applications', () => {
    emitApplications(null)

    const {result} = renderHookWithInstance(() => useStudioWorkspacesByProjectIdDataset())

    expect(result.current.workspacesByProjectIdAndDataset).toEqual({})
  })

  it('throws a TopicError to the error boundary when the dashboard fails to load applications', () => {
    host.connections.subscribe((client) => client.emit('applications.list', {ok: false}))
    const onError = vi.fn()

    function Workspaces() {
      const {workspacesByProjectIdAndDataset} = useStudioWorkspacesByProjectIdDataset()
      return <span>{Object.keys(workspacesByProjectIdAndDataset).length} workspaces</span>
    }

    render(
      <ErrorBoundary fallback={<span>Failed</span>} onError={onError}>
        <Suspense fallback="Loading">
          <Workspaces />
        </Suspense>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(TopicError)
  })
})
