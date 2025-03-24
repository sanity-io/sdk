import {type Message, type Status} from '@sanity/comlink'
import {renderHook, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useWindowConnection, type WindowConnection} from '../comlink/useWindowConnection'
import {useStudioWorkspacesByResourceId} from './useStudioWorkspacesByResourceId'

vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

const mockWorkspaceData = {
  context: {
    availableResources: [
      {
        projectId: 'project1',
        workspaces: [
          {
            name: 'workspace1',
            title: 'Workspace 1',
            basePath: '/workspace1',
            dataset: 'dataset1',
            userApplicationId: 'user1',
            url: 'https://test.sanity.studio',
            _ref: 'user1-workspace1',
          },
          {
            name: 'workspace2',
            title: 'Workspace 2',
            basePath: '/workspace2',
            dataset: 'dataset1',
            userApplicationId: 'user1',
            url: 'https://test.sanity.studio',
            _ref: 'user1-workspace2',
          },
        ],
      },
      {
        projectId: 'project2',
        workspaces: [
          {
            name: 'workspace3',
            title: 'Workspace 3',
            basePath: '/workspace3',
            dataset: 'dataset2',
            userApplicationId: 'user2',
            url: 'https://test.sanity.studio',
            _ref: 'user2-workspace3',
          },
        ],
      },
      {
        // Project without workspaces
        projectId: 'project3',
        workspaces: [],
      },
    ],
  },
}

describe('useStudioWorkspacesByResourceId', () => {
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

    const {result} = renderHook(() => useStudioWorkspacesByResourceId())

    // Call onStatus with 'idle' to simulate not connected
    if (capturedOnStatus) capturedOnStatus('idle')

    expect(result.current).toEqual({
      workspacesByResourceId: {},
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

    const {result} = renderHook(() => useStudioWorkspacesByResourceId())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

    await waitFor(() => {
      expect(result.current.workspacesByResourceId).toEqual({
        'project1:dataset1': [
          {
            name: 'workspace1',
            title: 'Workspace 1',
            basePath: '/workspace1',
            dataset: 'dataset1',
            userApplicationId: 'user1',
            url: 'https://test.sanity.studio',
            _ref: 'user1-workspace1',
          },
          {
            name: 'workspace2',
            title: 'Workspace 2',
            basePath: '/workspace2',
            dataset: 'dataset1',
            userApplicationId: 'user1',
            url: 'https://test.sanity.studio',
            _ref: 'user1-workspace2',
          },
        ],
        'project2:dataset2': [
          {
            name: 'workspace3',
            title: 'Workspace 3',
            basePath: '/workspace3',
            dataset: 'dataset2',
            userApplicationId: 'user2',
            url: 'https://test.sanity.studio',
            _ref: 'user2-workspace3',
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

    const {result} = renderHook(() => useStudioWorkspacesByResourceId())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

    await waitFor(() => {
      expect(result.current.workspacesByResourceId).toEqual({})
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

    const {result} = renderHook(() => useStudioWorkspacesByResourceId())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

    await waitFor(() => {
      expect(result.current.workspacesByResourceId).toEqual({})
      expect(result.current.error).toBeNull()
      expect(result.current.isConnected).toBe(true)
    })
  })

  it('should handle projects without workspaces', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      context: {
        availableResources: [
          {
            projectId: 'project1',
            workspaces: [],
          },
        ],
      },
    })
    let capturedOnStatus: ((status: Status) => void) | undefined

    vi.mocked(useWindowConnection).mockImplementation(({onStatus}) => {
      capturedOnStatus = onStatus

      return {
        fetch: mockFetch,
        sendMessage: vi.fn(),
      } as unknown as WindowConnection<Message>
    })

    const {result} = renderHook(() => useStudioWorkspacesByResourceId())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

    await waitFor(() => {
      expect(result.current.workspacesByResourceId).toEqual({})
      expect(result.current.error).toBeNull()
      expect(result.current.isConnected).toBe(true)
    })
  })

  it('should handle projects without projectId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      context: {
        availableResources: [
          {
            workspaces: [
              {
                name: 'workspace1',
                title: 'Workspace 1',
                basePath: '/workspace1',
                dataset: 'dataset1',
                userApplicationId: 'user1',
                url: 'https://test.sanity.studio',
                _ref: 'user1-workspace1',
              },
            ],
          },
        ],
      },
    })
    let capturedOnStatus: ((status: Status) => void) | undefined

    vi.mocked(useWindowConnection).mockImplementation(({onStatus}) => {
      capturedOnStatus = onStatus

      return {
        fetch: mockFetch,
        sendMessage: vi.fn(),
      } as unknown as WindowConnection<Message>
    })

    const {result} = renderHook(() => useStudioWorkspacesByResourceId())

    // Call onStatus with 'connected' to simulate connected state
    if (capturedOnStatus) capturedOnStatus('connected')

    await waitFor(() => {
      expect(result.current.workspacesByResourceId).toEqual({})
      expect(result.current.error).toBeNull()
      expect(result.current.isConnected).toBe(true)
    })
  })
})
