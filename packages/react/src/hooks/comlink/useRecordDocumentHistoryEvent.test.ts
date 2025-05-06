import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useRecordDocumentHistoryEvent} from './useRecordDocumentHistoryEvent'
import {useWindowConnection} from './useWindowConnection'

vi.mock('./useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

describe('useRecordDocumentHistoryEvent', () => {
  let mockSendMessage = vi.fn()
  const mockDocumentHandle = {
    documentId: 'mock-id',
    documentType: 'mock-type',
    resourceType: 'studio' as const,
    resourceId: 'mock-resource-id',
  }

  beforeEach(() => {
    mockSendMessage = vi.fn()
    vi.mocked(useWindowConnection).mockImplementation(() => {
      return {
        sendMessage: mockSendMessage,
        fetch: vi.fn(),
      }
    })
  })

  it('should send correct message when recording events', () => {
    const {result} = renderHook(() => useRecordDocumentHistoryEvent(mockDocumentHandle))

    result.current.recordEvent('viewed')
    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/history', {
      eventType: 'viewed',
      document: {
        id: 'mock-id',
        type: 'mock-type',
        resource: {
          id: 'mock-resource-id',
          type: 'studio',
        },
      },
    })
  })

  it('should handle errors when sending messages', () => {
    mockSendMessage.mockImplementation(() => {
      throw new Error('Failed to send message')
    })

    const {result} = renderHook(() => useRecordDocumentHistoryEvent(mockDocumentHandle))

    expect(() => result.current.recordEvent('viewed')).toThrow('Failed to send message')
  })
})
