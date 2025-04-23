import {type Status} from '@sanity/comlink'
import {type DocumentHandle} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useNavigateToStudioDocument} from './useNavigateToStudioDocument'

// Mock dependencies
const mockSendMessage = vi.fn()
const mockFetch = vi.fn()
let mockWorkspacesByProjectIdAndDataset = {}
let mockWorkspacesIsConnected = true
let mockStatusCallback: ((status: Status) => void) | null = null

vi.mock('../comlink/useWindowConnection', () => {
  return {
    useWindowConnection: ({onStatus}: {onStatus?: (status: Status) => void}) => {
      mockStatusCallback = onStatus || null
      return {
        sendMessage: mockSendMessage,
        fetch: mockFetch,
      }
    },
  }
})

vi.mock('./useStudioWorkspacesByProjectIdDataset', () => {
  return {
    useStudioWorkspacesByProjectIdDataset: () => ({
      workspacesByProjectIdAndDataset: mockWorkspacesByProjectIdAndDataset,
      error: null,
      isConnected: mockWorkspacesIsConnected,
    }),
  }
})

describe('useNavigateToStudioDocument', () => {
  const mockDocumentHandle: DocumentHandle = {
    documentId: 'doc123',
    documentType: 'article',
    projectId: 'project1',
    dataset: 'dataset1',
  }

  const mockWorkspace = {
    id: 'workspace123',
    name: 'workspace1',
    title: 'Workspace 1',
    basePath: '/workspace1',
    dataset: 'dataset1',
    userApplicationId: 'user1',
    url: 'https://test.sanity.studio',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace],
    }
    mockWorkspacesIsConnected = true
    mockStatusCallback = null
  })

  it('returns a function and connection status', () => {
    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    // Initially not connected
    expect(result.current.isConnected).toBe(false)

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    expect(result.current).toEqual({
      navigateToStudioDocument: expect.any(Function),
      isConnected: true,
    })
  })

  it('sends correct navigation message when called', () => {
    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/bridge/navigate-to-resource', {
      resourceId: 'workspace123',
      resourceType: 'studio',
      path: '/intent/edit/id=doc123;type=article',
    })
  })

  it('does not send message when not connected', () => {
    mockWorkspacesByProjectIdAndDataset = {}
    mockWorkspacesIsConnected = false

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('does not send message when no workspace is found', () => {
    mockWorkspacesByProjectIdAndDataset = {}
    mockWorkspacesIsConnected = true

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('warns when multiple workspaces are found', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockWorkspace2 = {...mockWorkspace, id: 'workspace2'}

    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace, mockWorkspace2],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(consoleSpy).toHaveBeenCalledWith(
      'Multiple workspaces found for document and no preferred studio url',
      mockDocumentHandle,
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      'dashboard/v1/bridge/navigate-to-resource',
      expect.objectContaining({
        resourceId: mockWorkspace.id,
      }),
    )

    consoleSpy.mockRestore()
  })

  it('warns and does not navigate when projectId or dataset is missing', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const incompleteDocumentHandle: DocumentHandle = {
      documentId: 'doc123',
      documentType: 'article',
      // missing projectId and dataset
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(incompleteDocumentHandle))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(consoleSpy).toHaveBeenCalledWith(
      'Project ID and dataset are required to navigate to a studio document',
    )
    expect(mockSendMessage).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('uses preferred studio URL when multiple workspaces are available', () => {
    const preferredUrl = 'https://preferred.sanity.studio'
    const mockWorkspace2 = {...mockWorkspace, id: 'workspace2', url: preferredUrl}

    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace, mockWorkspace2],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle, preferredUrl))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    // Should choose workspace2 because it matches the preferred URL
    expect(mockSendMessage).toHaveBeenCalledWith(
      'dashboard/v1/bridge/navigate-to-resource',
      expect.objectContaining({
        resourceId: 'workspace2',
      }),
    )
  })

  it('considers NO_PROJECT_ID:NO_DATASET workspaces when matching preferred URL', () => {
    const preferredUrl = 'https://preferred.sanity.studio'
    // Only have a workspace without projectId/dataset that matches the preferred URL
    const mockWorkspaceNoProject = {
      ...mockWorkspace,
      id: 'workspace3',
      url: preferredUrl,
      projectId: undefined,
      dataset: undefined,
    }

    mockWorkspacesByProjectIdAndDataset = {
      'NO_PROJECT_ID:NO_DATASET': [mockWorkspaceNoProject],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle, preferredUrl))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    // Should choose the NO_PROJECT_ID:NO_DATASET workspace because it matches the preferred URL
    expect(mockSendMessage).toHaveBeenCalledWith(
      'dashboard/v1/bridge/navigate-to-resource',
      expect.objectContaining({
        resourceId: 'workspace3',
      }),
    )
  })

  it('warns with preferred URL info when no matching workspace is found', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const preferredUrl = 'https://nonexistent.sanity.studio'

    // Set up workspaces that don't match the preferred URL
    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [
        {
          ...mockWorkspace,
          url: 'https://different.sanity.studio',
        },
      ],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle, preferredUrl))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(consoleSpy).toHaveBeenCalledWith(
      `No workspace found for document with projectId: ${mockDocumentHandle.projectId} and dataset: ${mockDocumentHandle.dataset} or with preferred studio url: ${preferredUrl}`,
    )
    expect(mockSendMessage).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
