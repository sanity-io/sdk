import {type DocumentHandle} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useDispatchIntent} from './useDispatchIntent'

// Mock the useWindowConnection hook
const mockSendMessage = vi.fn()
vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(() => ({
    sendMessage: mockSendMessage,
  })),
}))

describe('useDispatchIntent', () => {
  const mockDocumentHandle: DocumentHandle = {
    documentId: 'test-document-id',
    documentType: 'test-document-type',
    projectId: 'test-project-id',
    dataset: 'test-dataset',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementation to default behavior
    mockSendMessage.mockImplementation(() => {})
  })

  it('should return dispatchIntent function', () => {
    const {result} = renderHook(() =>
      useDispatchIntent({action: 'edit', documentHandle: mockDocumentHandle}),
    )

    expect(result.current).toEqual({
      dispatchIntent: expect.any(Function),
    })
  })

  it('should throw error when neither action nor intentId is provided', () => {
    const {result} = renderHook(() => useDispatchIntent({documentHandle: mockDocumentHandle}))

    expect(() => result.current.dispatchIntent()).toThrow(
      'useDispatchIntent: Either `action` or `intentId` must be provided.',
    )
  })

  it('should handle errors gracefully', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSendMessage.mockImplementation(() => {
      throw new Error('Test error')
    })

    const {result} = renderHook(() =>
      useDispatchIntent({action: 'edit', documentHandle: mockDocumentHandle}),
    )

    expect(() => result.current.dispatchIntent()).toThrow('Test error')
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to dispatch intent:', expect.any(Error))

    consoleErrorSpy.mockRestore()
  })

  it('should use memoized dispatchIntent function', () => {
    const params = {action: 'edit' as const, documentHandle: mockDocumentHandle}
    const {result, rerender} = renderHook(
      ({params: hookParams}: {params: typeof params}) => useDispatchIntent(hookParams),
      {
        initialProps: {params},
      },
    )

    const firstDispatchIntent = result.current.dispatchIntent

    // Rerender with the same params
    rerender({params: {action: 'edit' as const, documentHandle: mockDocumentHandle}})

    expect(result.current.dispatchIntent).toBe(firstDispatchIntent)
  })

  it('should create new dispatchIntent function when documentHandle changes', () => {
    const {result, rerender} = renderHook(
      (params: {action: 'edit'; documentHandle: DocumentHandle}) => useDispatchIntent(params),
      {
        initialProps: {action: 'edit' as const, documentHandle: mockDocumentHandle},
      },
    )

    const firstDispatchIntent = result.current.dispatchIntent

    const newDocumentHandle: DocumentHandle = {
      documentId: 'new-document-id',
      documentType: 'new-document-type',
      projectId: 'new-project-id',
      dataset: 'new-dataset',
    }

    rerender({action: 'edit' as const, documentHandle: newDocumentHandle})

    expect(result.current.dispatchIntent).not.toBe(firstDispatchIntent)
  })

  it('should warn if both action and intentId are provided', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const {result} = renderHook(() =>
      useDispatchIntent({
        action: 'edit' as const,
        intentId: 'custom-intent' as never, // test runtime error when both are provided
        documentHandle: mockDocumentHandle,
      }),
    )
    result.current.dispatchIntent()
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'useDispatchIntent: Both `action` and `intentId` were provided. Using `intentId` and ignoring `action`.',
    )
    consoleWarnSpy.mockRestore()
  })

  it('should send intent message with action and params when both are provided', () => {
    const intentParams = {view: 'editor', tab: 'content'}
    const {result} = renderHook(() =>
      useDispatchIntent({
        action: 'edit',
        documentHandle: mockDocumentHandle,
        parameters: intentParams,
      }),
    )

    result.current.dispatchIntent()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/intents/dispatch-intent', {
      action: 'edit',
      document: {
        id: 'test-document-id',
        type: 'test-document-type',
      },
      resource: {
        id: 'test-project-id.test-dataset',
      },
      parameters: intentParams,
    })
  })

  it('should send intent message with intentId and params when both are provided', () => {
    const intentParams = {view: 'editor', tab: 'content'}
    const {result} = renderHook(() =>
      useDispatchIntent({
        intentId: 'custom-intent',
        documentHandle: mockDocumentHandle,
        parameters: intentParams,
      }),
    )

    result.current.dispatchIntent()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/intents/dispatch-intent', {
      intentId: 'custom-intent',
      document: {
        id: 'test-document-id',
        type: 'test-document-type',
      },
      resource: {
        id: 'test-project-id.test-dataset',
      },
      parameters: intentParams,
    })
  })

  it('should send intent message with media library source', () => {
    const mockMediaLibraryHandle: DocumentHandle = {
      documentId: 'test-asset-id',
      documentType: 'sanity.asset',
      sourceName: 'media-library',
    }

    const {result} = renderHook(() =>
      useDispatchIntent({
        action: 'edit',
        documentHandle: mockMediaLibraryHandle,
      }),
    )

    result.current.dispatchIntent()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/intents/dispatch-intent', {
      action: 'edit',
      document: {
        id: 'test-asset-id',
        type: 'sanity.asset',
      },
      resource: {
        id: 'media-library-id',
        type: 'media-library',
      },
    })
  })

  it('should send intent message with canvas source', () => {
    const mockCanvasHandle: DocumentHandle = {
      documentId: 'test-canvas-document-id',
      documentType: 'sanity.canvas.document',
      sourceName: 'canvas',
    }

    const {result} = renderHook(() =>
      useDispatchIntent({
        action: 'edit',
        documentHandle: mockCanvasHandle,
      }),
    )

    result.current.dispatchIntent()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/intents/dispatch-intent', {
      action: 'edit',
      document: {
        id: 'test-canvas-document-id',
        type: 'sanity.canvas.document',
      },
      resource: {
        id: 'canvas-id',
        type: 'canvas',
      },
    })
  })

  describe('error handling', () => {
    it('should throw error when neither source nor projectId/dataset is provided', () => {
      const invalidHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
      }

      const {result} = renderHook(() =>
        useDispatchIntent({
          action: 'edit',
          documentHandle: invalidHandle as unknown as DocumentHandle,
        }),
      )

      expect(() => result.current.dispatchIntent()).toThrow(
        'useDispatchIntent: Either `source` or both `projectId` and `dataset` must be provided in documentHandle.',
      )
    })
  })
})
