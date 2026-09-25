import {recordDocumentHistoryEvent} from '@sanity/sdk'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type ApplicationActivity, type MessageBusHost} from '@sanity/sdk/dashboard'
import {NEVER, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook, waitFor} from '../../../test/test-utils'
import {useRecordDocumentHistoryEvent} from './useRecordDocumentHistoryEvent'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    recordDocumentHistoryEvent: vi.fn(actual.recordDocumentHistoryEvent),
  }
})

const documentHandle = {
  documentId: 'mock-id',
  documentType: 'mock-type',
  resourceType: 'studio' as const,
  resourceId: 'mock-resource-id',
  schemaName: 'production',
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useRecordDocumentHistoryEvent (Comlink)', () => {
  it('forwards the handle and event type to the action, allowing a studio without resourceId', () => {
    vi.mocked(recordDocumentHistoryEvent).mockReturnValueOnce(NEVER)
    const handle = {...documentHandle, resourceId: undefined}

    const {result} = renderHook(() => useRecordDocumentHistoryEvent(handle))
    expect(result.current).not.toBeNull()
    result.current.recordEvent('viewed')

    expect(recordDocumentHistoryEvent).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      ...handle,
      eventType: 'viewed',
    })
  })

  it('logs a failed event instead of throwing', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Failed to send message')
    vi.mocked(recordDocumentHistoryEvent).mockReturnValueOnce(throwError(() => error))

    const {result} = renderHook(() => useRecordDocumentHistoryEvent(documentHandle))

    expect(() => result.current.recordEvent('viewed')).not.toThrow()
    expect(consoleError).toHaveBeenCalledWith('Failed to record history event:', error)
    consoleError.mockRestore()
  })

  it('throws when resourceId is missing for non-studio resources', () => {
    expect(() =>
      renderHook(() =>
        useRecordDocumentHistoryEvent({
          ...documentHandle,
          resourceType: 'media-library',
          resourceId: undefined,
        }),
      ),
    ).toThrow('resourceId is required for media-library and canvas resources')
  })
})

describe('useRecordDocumentHistoryEvent (message bus)', () => {
  const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
  let host: MessageBusHost

  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('records an event before the host publishes its capabilities and sends it once they do', async () => {
    const activity: ApplicationActivity[] = []
    host.subscribe('applications.activity', (message) => activity.push(message.payload))

    const {result} = renderHook(() => useRecordDocumentHistoryEvent(documentHandle))
    result.current.recordEvent('edited')
    expect(activity).toEqual([])

    host.connections.subscribe((client) =>
      client.emit('applications.capabilities', {history: true}),
    )

    await waitFor(() => expect(activity).toMatchObject([{kind: 'document', eventType: 'edited'}]))
  })

  it('throws when resourceId is missing', () => {
    expect(() =>
      renderHook(() => useRecordDocumentHistoryEvent({...documentHandle, resourceId: undefined})),
    ).toThrow('resourceId is required to record document history under the message bus')
  })
})
