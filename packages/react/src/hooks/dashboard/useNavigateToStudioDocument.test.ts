import {type StudioResource} from '@sanity/message-protocol'
import {type DocumentHandle} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useNavigateToStudioDocument} from './useNavigateToStudioDocument'

// Mock dependencies
const mockSendMessage = vi.fn()
const mockFetch = vi.fn()
let mockWorkspacesByProjectIdAndDataset: Record<string, StudioResource[]> = {}

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

function makeStudioResource(overrides: Record<string, unknown> = {}): StudioResource {
  return {
    id: 'workspace123',
    name: 'workspace1',
    title: 'Workspace 1',
    basePath: '/workspace1',
    projectId: 'project1',
    dataset: 'dataset1',
    userApplicationId: 'user1',
    url: 'https://test.sanity.studio',
    href: 'https://test.sanity.studio',
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
  } as StudioResource
}

describe('useNavigateToStudioDocument', () => {
  const mockDocumentHandle: DocumentHandle = {
    documentId: 'doc123',
    documentType: 'article',
    projectId: 'project1',
    dataset: 'dataset1',
  }

  const mockWorkspace = makeStudioResource()

  beforeEach(() => {
    vi.resetAllMocks()
    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace],
    }
  })

  it('returns navigate function, workspace info, href, hasTarget, and ready status', () => {
    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    expect(result.current.navigateToStudioDocument).toEqual(expect.any(Function))
    expect(result.current.status).toBe('ready')
    expect(result.current.hasTarget).toBe(true)
    expect(result.current.href).toBe(
      'https://test.sanity.studio/workspace1/intent/edit/id=doc123;type=article',
    )
    expect(result.current.workspace).toEqual({
      id: 'workspace123',
      name: 'workspace1',
      title: 'Workspace 1',
      url: 'https://test.sanity.studio',
      basePath: '/workspace1',
      isDeployed: true,
      hasManifest: true,
      hasSchema: true,
      urlType: 'internal',
    })
    expect(result.current.workspaces).toHaveLength(1)
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

  it('returns no-workspace status with hasTarget false and href null when no workspace is found', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockWorkspacesByProjectIdAndDataset = {}
    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    expect(result.current.status).toBe('no-workspace')
    expect(result.current.hasTarget).toBe(false)
    expect(result.current.href).toBeNull()
    expect(result.current.workspace).toBeNull()
    expect(result.current.workspaces).toHaveLength(0)

    result.current.navigateToStudioDocument()
    expect(mockSendMessage).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('returns multiple-workspaces status with hasTarget true when multiple workspaces match without preferred URL', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockWorkspace2 = makeStudioResource({
      id: 'workspace2',
      url: 'https://test2.sanity.studio',
    })

    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace, mockWorkspace2],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

    expect(result.current.status).toBe('multiple-workspaces')
    expect(result.current.hasTarget).toBe(true)
    expect(result.current.href).toBe(
      'https://test.sanity.studio/workspace1/intent/edit/id=doc123;type=article',
    )
    expect(result.current.workspaces).toHaveLength(2)
    // Still resolves to the first workspace
    expect(result.current.workspace).not.toBeNull()
    expect(result.current.workspace!.id).toBe('workspace123')

    result.current.navigateToStudioDocument()

    expect(consoleSpy).toHaveBeenCalledWith(
      'Multiple workspaces found for document and no preferred studio url',
      {projectId: 'project1', dataset: 'dataset1'},
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      'dashboard/v1/bridge/navigate-to-resource',
      expect.objectContaining({
        resourceId: mockWorkspace.id,
      }),
    )

    consoleSpy.mockRestore()
  })

  it('returns no-workspace status with hasTarget false when projectId or dataset is missing', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const incompleteDocumentHandle: DocumentHandle = {
      documentId: 'doc123',
      documentType: 'article',
      // missing projectId and dataset
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(incompleteDocumentHandle))

    expect(result.current.status).toBe('no-workspace')
    expect(result.current.hasTarget).toBe(false)
    expect(result.current.href).toBeNull()
    expect(result.current.workspace).toBeNull()
    expect(result.current.workspaces).toHaveLength(0)

    result.current.navigateToStudioDocument()

    expect(consoleSpy).toHaveBeenCalledWith(
      'Project ID and dataset are required to navigate to a studio document',
    )
    expect(mockSendMessage).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('uses preferred studio URL when multiple workspaces are available', () => {
    const preferredUrl = 'https://preferred.sanity.studio'
    const mockWorkspace2 = makeStudioResource({id: 'workspace2', url: preferredUrl})

    mockWorkspacesByProjectIdAndDataset = {
      'project1:dataset1': [mockWorkspace, mockWorkspace2],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle, preferredUrl))

    expect(result.current.status).toBe('ready')
    expect(result.current.workspace!.id).toBe('workspace2')

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
    const mockWorkspaceNoProject = makeStudioResource({
      id: 'workspace3',
      url: preferredUrl,
      projectId: undefined,
      dataset: undefined,
      hasManifest: false,
    })

    mockWorkspacesByProjectIdAndDataset = {
      'NO_PROJECT_ID:NO_DATASET': [mockWorkspaceNoProject],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle, preferredUrl))

    expect(result.current.workspace!.id).toBe('workspace3')

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
      'project1:dataset1': [makeStudioResource({url: 'https://different.sanity.studio'})],
    }

    const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle, preferredUrl))

    expect(result.current.workspace).toBeNull()

    result.current.navigateToStudioDocument()

    expect(consoleSpy).toHaveBeenCalledWith(
      `No workspace found for document with projectId: ${mockDocumentHandle.projectId} and dataset: ${mockDocumentHandle.dataset} or with preferred studio url: ${preferredUrl}`,
    )
    expect(mockSendMessage).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  describe('deployment status detection', () => {
    it('returns not-deployed with hasTarget false for internal workspace without active deployment', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            urlType: 'internal',
            activeDeployment: null,
            hasManifest: true,
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.status).toBe('not-deployed')
      expect(result.current.hasTarget).toBe(false)
      expect(result.current.workspace!.isDeployed).toBe(false)
    })

    it('returns ready for internal workspace with active deployment and manifest', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            urlType: 'internal',
            activeDeployment: {id: 'deploy-1'},
            hasManifest: true,
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.status).toBe('ready')
      expect(result.current.workspace!.isDeployed).toBe(true)
      expect(result.current.workspace!.hasManifest).toBe(true)
    })

    it('returns no-manifest with hasTarget false for deployed workspace without manifest', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            urlType: 'internal',
            activeDeployment: {id: 'deploy-1'},
            hasManifest: false,
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.status).toBe('no-manifest')
      expect(result.current.hasTarget).toBe(false)
      expect(result.current.workspace!.isDeployed).toBe(true)
      expect(result.current.workspace!.hasManifest).toBe(false)
    })

    it('returns ready for external workspace (always considered deployed)', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            urlType: 'external',
            activeDeployment: null,
            hasManifest: true,
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.status).toBe('ready')
      expect(result.current.workspace!.isDeployed).toBe(true)
      expect(result.current.workspace!.urlType).toBe('external')
    })

    it('still sends navigation message when status is not-deployed (status is informational)', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            urlType: 'internal',
            activeDeployment: null,
            hasManifest: true,
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.status).toBe('not-deployed')
      // Navigation still works — status is informational, not a gate
      result.current.navigateToStudioDocument()
      expect(mockSendMessage).toHaveBeenCalledWith(
        'dashboard/v1/bridge/navigate-to-resource',
        expect.objectContaining({
          resourceType: 'studio',
        }),
      )
    })

    it('still sends navigation message when status is no-manifest (status is informational)', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            urlType: 'internal',
            activeDeployment: {id: 'deploy-1'},
            hasManifest: false,
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.status).toBe('no-manifest')
      // Navigation still works — status is informational, not a gate
      result.current.navigateToStudioDocument()
      expect(mockSendMessage).toHaveBeenCalledWith(
        'dashboard/v1/bridge/navigate-to-resource',
        expect.objectContaining({
          resourceType: 'studio',
        }),
      )
    })

    it('returns no-manifest for external workspace without manifest', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            urlType: 'external',
            activeDeployment: null,
            hasManifest: false,
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.status).toBe('no-manifest')
      expect(result.current.workspace!.isDeployed).toBe(true)
      expect(result.current.workspace!.hasManifest).toBe(false)
    })
  })

  describe('href generation', () => {
    it('constructs absolute URL from workspace url + basePath + intent path', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            url: 'https://my-studio.sanity.studio',
            basePath: '/production',
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.href).toBe(
        'https://my-studio.sanity.studio/production/intent/edit/id=doc123;type=article',
      )
    })

    it('returns null href when no workspace is resolved', () => {
      mockWorkspacesByProjectIdAndDataset = {}

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      expect(result.current.href).toBeNull()
    })

    it('still provides href when status is not-deployed or no-manifest', () => {
      mockWorkspacesByProjectIdAndDataset = {
        'project1:dataset1': [
          makeStudioResource({
            urlType: 'internal',
            activeDeployment: null,
            hasManifest: false,
          }),
        ],
      }

      const {result} = renderHook(() => useNavigateToStudioDocument(mockDocumentHandle))

      // href is available even when hasTarget is false — consumers can still
      // show the URL for debugging or copy-to-clipboard
      expect(result.current.status).toBe('not-deployed')
      expect(result.current.hasTarget).toBe(false)
      expect(result.current.href).toBe(
        'https://test.sanity.studio/workspace1/intent/edit/id=doc123;type=article',
      )
    })
  })
})
