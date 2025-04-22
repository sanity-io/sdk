import {type Message, type Status} from '@sanity/comlink'
import {renderHook, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useWindowConnection, type WindowConnection} from '../comlink/useWindowConnection'
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

  it('should return empty workspaces and connected=false when not connected', async () => {
    // Create a mock that captures the onStatus callback
    let capturedOnStatus: ((status: Status) => void) | undefined

    vi.mocked(useWindowConnection).mockImplementation(({onStatus}) => {
      capturedOnStatus = onStatus

      return {
        fetch: undefined,
        sendMessage: vi.fn(),
      } as unknown as WindowConnection<Message>
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    // Call onStatus with 'idle' to simulate not connected
    if (capturedOnStatus) capturedOnStatus('idle')

    expect(result.current).toEqual({
      workspacesByProjectIdAndDataset: {},
      error: null,
      isConnected: false,
    })
  })

  it('should process workspaces into lookup by projectId:dataset', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockWorkspaceData)
    let capturedOnStatus: ((status: Status) => void) | undefined

    vi.mocked(useWindowConnection).mockImplementation(({onStatus}) => {
      capturedOnStatus = onStatus

      return {
        fetch: mockFetch,
        sendMessage: vi.fn(),
      } as unknown as WindowConnection<Message>
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

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
      expect(result.current.isConnected).toBe(true)
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'dashboard/v1/bridge/context',
      undefined,
      expect.any(Object),
    )
  })

  it('should handle fetch errors', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    let capturedOnStatus: ((status: Status) => void) | undefined

    vi.mocked(useWindowConnection).mockImplementation(({onStatus}) => {
      capturedOnStatus = onStatus

      return {
        fetch: mockFetch,
        sendMessage: vi.fn(),
      } as unknown as WindowConnection<Message>
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

    await waitFor(() => {
      expect(result.current.workspacesByProjectIdAndDataset).toEqual({})
      expect(result.current.error).toBe('Failed to fetch workspaces')
      expect(result.current.isConnected).toBe(true)
    })
  })

  it('should handle AbortError silently', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    const mockFetch = vi.fn().mockRejectedValue(abortError)
    let capturedOnStatus: ((status: Status) => void) | undefined

    vi.mocked(useWindowConnection).mockImplementation(({onStatus}) => {
      capturedOnStatus = onStatus

      return {
        fetch: mockFetch,
        sendMessage: vi.fn(),
      } as unknown as WindowConnection<Message>
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

    await waitFor(() => {
      expect(result.current.workspacesByProjectIdAndDataset).toEqual({})
      expect(result.current.error).toBeNull()
      expect(result.current.isConnected).toBe(true)
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
    let capturedOnStatus: ((status: Status) => void) | undefined

    vi.mocked(useWindowConnection).mockImplementation(({onStatus}) => {
      capturedOnStatus = onStatus

      return {
        fetch: mockFetch,
        sendMessage: vi.fn(),
      } as unknown as WindowConnection<Message>
    })

    const {result} = renderHook(() => useStudioWorkspacesByProjectIdDataset())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

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
      expect(result.current.isConnected).toBe(true)
    })
  })
})
