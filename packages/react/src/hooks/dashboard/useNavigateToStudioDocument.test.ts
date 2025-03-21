import {type Status} from '@sanity/comlink'
import {type DocumentHandle} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useNavigateToStudioDocument} from './useNavigateToStudioDocument'

// Mock dependencies
const mockSendMessage = vi.fn()
const mockFetch = vi.fn()
let mockWorkspacesByResourceId = {}
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

vi.mock('./useStudioWorkspacesByResourceId', () => {
  return {
    useStudioWorkspacesByResourceId: () => ({
      workspacesByResourceId: mockWorkspacesByResourceId,
      error: null,
      isConnected: mockWorkspacesIsConnected,
    }),
  }
})

describe('useNavigateToStudioDocument', () => {
  const mockDocumentHandle: DocumentHandle = {
    _id: 'doc123',
    _type: 'article',
    resourceId: 'document:project1.dataset1:doc123',
  }

  const mockWorkspace = {
    name: 'workspace1',
    title: 'Workspace 1',
    basePath: '/workspace1',
    dataset: 'dataset1',
    userApplicationId: 'user1',
    url: 'https://test.sanity.studio',
    _ref: 'workspace123',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    mockWorkspacesByResourceId = {
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

    expect(mockSendMessage).toHaveBeenCalledWith('core/v1/bridge/navigate-to-resource', {
      resourceId: 'workspace123',
      resourceType: 'studio',
      path: '/intent/edit/id=doc123;type=article',
    })
  })

  it('does not send message when not connected', () => {
    mockWorkspacesByResourceId = {}
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
    mockWorkspacesByResourceId = {}
    mockWorkspacesIsConnected = true

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('handles invalid resourceId format', () => {
    const invalidDocHandle: DocumentHandle = {
      _id: 'doc123',
      _type: 'article',
      resourceId: 'document:project1.invalid:doc123' as `document:${string}.${string}:${string}`,
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(invalidDocHandle))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('warns when multiple workspaces are found', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockWorkspace2 = {...mockWorkspace, _ref: 'workspace2'}

    mockWorkspacesByResourceId = {
      'project1:dataset1': [mockWorkspace, mockWorkspace2],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    // Simulate connection
    act(() => {
      mockStatusCallback?.('connected')
    })

    result.current.navigateToStudioDocument()

    expect(consoleSpy).toHaveBeenCalledWith(
      'Multiple workspaces found for document',
      mockDocumentHandle.resourceId,
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      'core/v1/bridge/navigate-to-resource',
      expect.objectContaining({
        resourceId: mockWorkspace._ref,
      }),
    )

    consoleSpy.mockRestore()
  })
})
