import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type ApplicationActivity, type MessageBusHost} from '@sanity/sdk/dashboard'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

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

describe('useRecordDocumentHistoryEvent (message bus)', () => {
  const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
  let host: MessageBusHost

  const documentHandle = {
    documentId: 'mock-id',
    documentType: 'mock-type',
    resourceType: 'studio' as const,
    resourceId: 'mock-resource-id',
    schemaName: 'production',
  }

  const emitCapabilities = (value: {history?: boolean}) =>
    host.connections.subscribe((client) => client.emit('applications.capabilities', value))

  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    emitCapabilities({history: true})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it.each(['viewed', 'edited', 'created', 'deleted'] as const)(
    'emits a %s document activity event, mapping studios to their dataset resource',
    (eventType) => {
      const activity: ApplicationActivity[] = []
      host.subscribe('applications.activity', (message) => activity.push(message.payload))

      const {result} = renderHook(() => useRecordDocumentHistoryEvent(documentHandle))
      result.current.recordEvent(eventType)

      expect(useWindowConnection).not.toHaveBeenCalled()
      expect(activity).toEqual([
        {
          kind: 'document',
          eventType,
          document: {
            id: 'mock-id',
            type: 'mock-type',
            resource: {id: 'mock-resource-id', type: 'dataset', schemaName: 'production'},
          },
        },
      ])
    },
  )

  it('passes a non-studio resource type through unmapped', () => {
    const activity: ApplicationActivity[] = []
    host.subscribe('applications.activity', (message) => activity.push(message.payload))

    const {result} = renderHook(() =>
      useRecordDocumentHistoryEvent({...documentHandle, resourceType: 'media-library'}),
    )
    result.current.recordEvent('viewed')

    expect(activity[0].document.resource.type).toBe('media-library')
  })

  it.each([{history: false}, {}])(
    'does not emit when the host does not provide the history capability (%o)',
    (capabilities) => {
      emitCapabilities(capabilities)
      const activity: ApplicationActivity[] = []
      host.subscribe('applications.activity', (message) => activity.push(message.payload))

      const {result} = renderHook(() => useRecordDocumentHistoryEvent(documentHandle))
      result.current.recordEvent('viewed')

      expect(activity).toEqual([])
    },
  )

  it('throws when resourceId is missing', () => {
    expect(() =>
      renderHook(() => useRecordDocumentHistoryEvent({...documentHandle, resourceId: undefined})),
    ).toThrow('resourceId is required to record document history under the message bus')
  })

  it('keeps recordEvent referentially stable when capabilities re-publish unchanged', () => {
    const {result, rerender} = renderHook(() => useRecordDocumentHistoryEvent(documentHandle))
    const first = result.current.recordEvent

    // Re-publishing the same value must not churn the callback: a dependency on the whole
    // capabilities object rather than `capabilities.history` would fail here.
    emitCapabilities({history: true})
    rerender()

    expect(result.current.recordEvent).toBe(first)
  })
})
