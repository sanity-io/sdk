import {type Message, type Node, type Status} from '@sanity/comlink'
import {getOrCreateNode} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {act, renderHook} from '../../../test/test-utils'
import {useManageFavorite} from './useManageFavorite'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getOrCreateNode: vi.fn(),
    releaseNode: vi.fn(),
  }
})

describe('useManageFavorite', () => {
  let node: Node<Message, Message>
  let statusCallback: ((status: Status) => void) | null = null

  const mockDocumentHandle = {
    _id: 'mock-id',
    _type: 'mock-type',
  }

  function createMockNode() {
    return {
      on: vi.fn(() => () => {}),
      post: vi.fn(),
      stop: vi.fn(),
      onStatus: vi.fn((callback) => {
        statusCallback = callback
        return () => {}
      }),
    } as unknown as Node<Message, Message>
  }

  beforeEach(() => {
    statusCallback = null
    node = createMockNode()
    vi.mocked(getOrCreateNode).mockReturnValue(node)
  })

  it('should initialize with default states', () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    expect(result.current.isFavorited).toBe(false)
    expect(result.current.isConnected).toBe(false)
  })

  it('should handle favorite action', () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    act(() => {
      result.current.favorite()
    })

    expect(node.post).toHaveBeenCalledWith('dashboard/v1/events/favorite', {
      documentId: 'mock-id',
      documentType: 'mock-type',
      eventType: 'added',
    })
    expect(result.current.isFavorited).toBe(true)
  })

  it('should handle unfavorite action', () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    act(() => {
      result.current.unfavorite()
    })

    expect(node.post).toHaveBeenCalledWith('dashboard/v1/events/favorite', {
      documentId: 'mock-id',
      documentType: 'mock-type',
      eventType: 'removed',
    })
    expect(result.current.isFavorited).toBe(false)
  })

  it('should throw error during favorite/unfavorite actions', () => {
    const errorMessage = 'Failed to update favorite status'

    vi.mocked(node.post).mockImplementationOnce(() => {
      throw new Error(errorMessage)
    })

    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    act(() => {
      expect(() => result.current.favorite()).toThrow(errorMessage)
    })
  })

  it('should update connection status', () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    expect(result.current.isConnected).toBe(false)

    act(() => {
      statusCallback?.('connected')
    })

    expect(result.current.isConnected).toBe(true)
  })
})
