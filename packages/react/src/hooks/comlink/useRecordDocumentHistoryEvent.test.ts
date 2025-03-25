import {type Message, type Node, type Status} from '@sanity/comlink'
import {getOrCreateNode} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {act, renderHook} from '../../../test/test-utils'
import {useRecordDocumentHistoryEvent} from './useRecordDocumentHistoryEvent'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getOrCreateNode: vi.fn(),
    releaseNode: vi.fn(),
  }
})

describe('useRecordDocumentHistoryEvent', () => {
  let node: Node<Message, Message>
  let statusCallback: ((status: Status) => void) | null = null

  const mockDocumentHandle = {
    documentId: 'mock-id',
    documentType: 'mock-type',
    resourceType: 'studio' as const,
    resourceId: 'mock-resource-id',
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

  it('should initialize with correct connection status', () => {
    const {result} = renderHook(() => useRecordDocumentHistoryEvent(mockDocumentHandle))

    expect(result.current.isConnected).toBe(false)

    act(() => {
      statusCallback?.('connected')
    })

    expect(result.current.isConnected).toBe(true)
  })

  it('should send correct message when recording events', () => {
    const {result} = renderHook(() => useRecordDocumentHistoryEvent(mockDocumentHandle))

    result.current.recordEvent('viewed')

    expect(node.post).toHaveBeenCalledWith('dashboard/v1/events/history', {
      eventType: 'viewed',
      documentId: 'mock-id',
      documentType: 'mock-type',
      resourceType: 'studio',
      resourceId: 'mock-resource-id',
    })
  })

  it('should handle errors when sending messages', () => {
    vi.mocked(node.post).mockImplementation(() => {
      throw new Error('Failed to send message')
    })

    const {result} = renderHook(() => useRecordDocumentHistoryEvent(mockDocumentHandle))

    expect(() => result.current.recordEvent('viewed')).toThrow('Failed to send message')
  })
})
