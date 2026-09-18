import {type DocumentHandle} from '@sanity/sdk'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost} from '@sanity/sdk/dashboard'
import {renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook as renderHookWithInstance} from '../../../test/test-utils'
import {useNavigateToStudioDocument} from './useNavigateToStudioDocument'

// Mock dependencies
const mockSendMessage = vi.fn()
const mockFetch = vi.fn()
let mockWorkspacesByProjectIdAndDataset = {}

vi.mock('../comlink/useWindowConnection', () => {
  return {
    useWindowConnection: () => {
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
  })

  it('sends correct navigation message when called', () => {
    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    result.current.navigateToStudioDocument()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/bridge/navigate-to-resource', {
      resourceId: 'workspace123',
      resourceType: 'studio',
      path: '/intent/edit/id=doc123;type=article',
    })
  })

  it('does not send message when no workspace is found', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockWorkspacesByProjectIdAndDataset = {}
    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))
    result.current.navigateToStudioDocument()
    expect(mockSendMessage).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('warns when multiple workspaces are found', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockWorkspace2 = {...mockWorkspace, id: 'workspace2'}

    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace, mockWorkspace2],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

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

    result.current.navigateToStudioDocument()

    expect(consoleSpy).toHaveBeenCalledWith(
      `No workspace found for document with projectId: ${mockDocumentHandle.projectId} and dataset: ${mockDocumentHandle.dataset} or with preferred studio url: ${preferredUrl}`,
    )
    expect(mockSendMessage).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})

describe('useNavigateToStudioDocument (message bus)', () => {
  const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
  let host: MessageBusHost
  let updates: {url: string}[]
  let reply: {ok: true} | {ok: false; reason: 'not-navigable' | 'interrupted' | 'failed'}

  const mockDocumentHandle: DocumentHandle = {
    documentId: 'doc123',
    documentType: 'article',
    projectId: 'project1',
    dataset: 'dataset1',
  }

  const mockWorkspace = {
    id: 'workspace123',
    name: 'production',
    title: 'Production',
    basePath: '/production',
    projectId: 'project1',
    dataset: 'dataset1',
    type: 'studio',
    userApplicationId: 'studio-app',
    url: 'https://test.sanity.studio',
  }

  beforeEach(() => {
    // Reset shared mocks so `mockSendMessage` assertions don't depend on test order.
    vi.resetAllMocks()
    updates = []
    reply = {ok: true}
    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace],
    }
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    host.subscribe('navigation.location.update', (message) => {
      updates.push(message.payload)
      message.reply(reply)
    })
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('emits navigation.location.update with the studio edit intent url', () => {
    const {result} = renderHookWithInstance(() => useNavigateToStudioDocument(mockDocumentHandle))

    result.current.navigateToStudioDocument()

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(updates).toEqual([
      {url: '/studios/studio-app/production/intent/edit/id=doc123;type=article/'},
    ])
  })

  it('selects the workspace matching the preferred studio url', () => {
    const preferredUrl = 'https://preferred.sanity.studio'
    const mockWorkspace2 = {
      ...mockWorkspace,
      id: 'workspace2',
      name: 'staging',
      userApplicationId: 'preferred-app',
      url: preferredUrl,
    }
    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace, mockWorkspace2],
    }

    const {result} = renderHookWithInstance(() =>
      useNavigateToStudioDocument(mockDocumentHandle, preferredUrl),
    )

    result.current.navigateToStudioDocument()

    expect(updates).toEqual([
      {url: '/studios/preferred-app/staging/intent/edit/id=doc123;type=article/'},
    ])
  })

  it('warns and does not emit when no workspace is found', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockWorkspacesByProjectIdAndDataset = {}

    const {result} = renderHookWithInstance(() => useNavigateToStudioDocument(mockDocumentHandle))
    result.current.navigateToStudioDocument()

    expect(updates).toEqual([])
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('warns when the host rejects the navigation', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    reply = {ok: false, reason: 'not-navigable'}

    const {result} = renderHookWithInstance(() => useNavigateToStudioDocument(mockDocumentHandle))
    result.current.navigateToStudioDocument()

    await vi.waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to navigate to studio document',
        expect.objectContaining({ok: false, reason: 'not-navigable'}),
      ),
    )
    consoleSpy.mockRestore()
  })
})
