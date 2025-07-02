import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useWindowConnection} from '../comlink/useWindowConnection'
import {useRecordDocumentHistoryEvent} from './useRecordDocumentHistoryEvent'

vi.mock('../comlink/useWindowConnection', () => ({
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
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSendMessage.mockImplementation(() => {
      throw new Error('Failed to send message')
    })

    const {result} = renderHook(() => useRecordDocumentHistoryEvent(mockDocumentHandle))

    expect(() => result.current.recordEvent('viewed')).toThrow('Failed to send message')
    consoleErrorSpy.mockRestore()
  })

  it('should throw error when resourceId is missing for non-studio resources', () => {
    const mockMediaDocumentHandle = {
      documentId: 'mock-id',
      documentType: 'mock-type',
      resourceType: 'media-library' as const,
      resourceId: undefined,
    }

    expect(() => renderHook(() => useRecordDocumentHistoryEvent(mockMediaDocumentHandle))).toThrow(
      'resourceId is required for media-library and canvas resources',
    )
  })
})
