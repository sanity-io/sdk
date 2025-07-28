import {type DocumentHandle} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useSendIntent} from './useSendIntent'

// Mock the useWindowConnection hook
const mockSendMessage = vi.fn()
vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(() => ({
    sendMessage: mockSendMessage,
  })),
}))

describe('useSendIntent', () => {
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

  it('should return sendIntent function', () => {
    const {result} = renderHook(() => useSendIntent({documentHandle: mockDocumentHandle}))

    expect(result.current).toEqual({
      sendIntent: expect.any(Function),
    })
  })

  it('should send intent message when sendIntent is called', () => {
    const {result} = renderHook(() => useSendIntent({documentHandle: mockDocumentHandle}))

    result.current.sendIntent()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/intents/send-intent', {
      document: {
        id: 'test-document-id',
        type: 'test-document-type',
      },
      resource: {
        id: 'test-project-id.test-dataset',
      },
    })
  })

  it('should handle errors gracefully', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSendMessage.mockImplementation(() => {
      throw new Error('Test error')
    })

    const {result} = renderHook(() => useSendIntent({documentHandle: mockDocumentHandle}))

    expect(() => result.current.sendIntent()).toThrow('Test error')
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to send intent:', expect.any(Error))

    consoleErrorSpy.mockRestore()
  })

  it('should use memoized sendIntent function', () => {
    const {result, rerender} = renderHook(({params}) => useSendIntent(params), {
      initialProps: {params: {documentHandle: mockDocumentHandle}},
    })

    const firstSendIntent = result.current.sendIntent

    // Rerender with the same params
    rerender({params: {documentHandle: mockDocumentHandle}})

    expect(result.current.sendIntent).toBe(firstSendIntent)
  })

  it('should create new sendIntent function when documentHandle changes', () => {
    const {result, rerender} = renderHook(({params}) => useSendIntent(params), {
      initialProps: {params: {documentHandle: mockDocumentHandle}},
    })

    const firstSendIntent = result.current.sendIntent

    const newDocumentHandle: DocumentHandle = {
      documentId: 'new-document-id',
      documentType: 'new-document-type',
      projectId: 'new-project-id',
      dataset: 'new-dataset',
    }

    rerender({params: {documentHandle: newDocumentHandle}})

    expect(result.current.sendIntent).not.toBe(firstSendIntent)
  })

  it('should send intent message with params when provided', () => {
    const intentParams = {view: 'editor', tab: 'content'}
    const {result} = renderHook(() =>
      useSendIntent({
        documentHandle: mockDocumentHandle,
        params: intentParams,
      }),
    )

    result.current.sendIntent()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/intents/send-intent', {
      document: {
        id: 'test-document-id',
        type: 'test-document-type',
      },
      resource: {
        id: 'test-project-id.test-dataset',
      },
      params: intentParams,
    })
  })
})
