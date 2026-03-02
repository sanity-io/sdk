import {renderHook, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useStudioWorkspacesByProjectIdDataset} from './useStudioWorkspacesByProjectIdDataset'

vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

function makeStudioResource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'default-id',
    projectId: 'project1',
    dataset: 'dataset1',
    name: 'workspace1',
    title: 'Workspace 1',
    basePath: '/workspace1',
    userApplicationId: 'user1',
    url: 'https://test1.sanity.studio',
    href: 'https://test1.sanity.studio',
    type: 'studio',
    urlType: 'internal',
    activeDeployment: {
      id: 'deploy-1',
      version: '1.0.0',
      isActiveDeployment: true,
      userApplicationId: 'user1',
      isAutoUpdating: false,
      manifest: null,
      size: 1024,
      deployedAt: '2026-01-01T00:00:00Z',
      deployedBy: 'user1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    hasManifest: true,
    hasSchema: true,
    dashboardStatus: 'default',
    autoUpdatingVersion: null,
    manifest: null,
    config: {},
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const mockWorkspaceData = {
  context: {
    availableResources: [
      makeStudioResource({
        id: 'user1-workspace1',
        name: 'workspace1',
        title: 'Workspace 1',
        basePath: '/workspace1',
        url: 'https://test1.sanity.studio',
        href: 'https://test1.sanity.studio',
        userApplicationId: 'user1',
      }),
      makeStudioResource({
        id: 'user1-workspace2',
        name: 'workspace2',
        title: 'Workspace 2',
        basePath: '/workspace2',
        url: 'https://test2.sanity.studio',
        href: 'https://test2.sanity.studio',
        userApplicationId: 'user1',
      }),
      makeStudioResource({
        id: 'user2-workspace3',
        projectId: 'project2',
        dataset: 'dataset2',
        name: 'workspace3',
        title: 'Workspace 3',
        basePath: '/workspace3',
        url: 'https://test3.sanity.studio',
        href: 'https://test3.sanity.studio',
        userApplicationId: 'user2',
      }),
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
      const p1d1 = result.current.workspacesByProjectIdAndDataset['project1:dataset1']
      expect(p1d1).toHaveLength(2)
      expect(p1d1[0].id).toBe('user1-workspace1')
      expect(p1d1[1].id).toBe('user1-workspace2')

      const p2d2 = result.current.workspacesByProjectIdAndDataset['project2:dataset2']
      expect(p2d2).toHaveLength(1)
      expect(p2d2[0].id).toBe('user2-workspace3')

      expect(result.current.error).toBeNull()
    })

    expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/context', undefined, expect.any(Object))
  })

  it('should preserve StudioResource fields like urlType, activeDeployment, hasManifest', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockWorkspaceData)
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    await waitFor(() => {
      const workspace = result.current.workspacesByProjectIdAndDataset['project1:dataset1'][0]
      expect(workspace.urlType).toBe('internal')
      expect(workspace.activeDeployment).not.toBeNull()
      expect(workspace.hasManifest).toBe(true)
      expect(workspace.hasSchema).toBe(true)
      expect(workspace.dashboardStatus).toBe('default')
    })
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
          makeStudioResource({
            id: 'studio1',
            projectId: 'project1',
            dataset: 'dataset1',
          }),
          makeStudioResource({
            id: 'non-studio',
            projectId: 'project2',
            dataset: 'dataset2',
            type: 'other',
          }),
          makeStudioResource({
            id: 'studio-no-project',
            projectId: undefined,
            dataset: undefined,
            name: 'incomplete-workspace',
            title: 'Incomplete Workspace',
            hasManifest: false,
          }),
          makeStudioResource({
            id: 'studio-no-dataset',
            projectId: 'project3',
            dataset: undefined,
            name: 'no-dataset-workspace',
            title: 'No Dataset Workspace',
            hasManifest: false,
          }),
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
