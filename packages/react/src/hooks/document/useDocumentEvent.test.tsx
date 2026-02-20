// tests/useDocumentEvent.test.ts
import {type DocumentEvent, type DocumentHandle, subscribeDocumentEvents} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useDocumentEvent} from './useDocumentEvent'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, subscribeDocumentEvents: vi.fn()}
})

const docHandle: DocumentHandle = {
  documentId: 'doc1',
  documentType: 'book',
}

describe('useDocumentEvent hook', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('calls subscribeDocumentEvents with instance and a stable handler', () => {
    const handleEvent = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(subscribeDocumentEvents).mockReturnValue(unsubscribe)

    renderHook(() => useDocumentEvent({...docHandle, onEvent: handleEvent}), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    expect(vi.mocked(subscribeDocumentEvents)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(subscribeDocumentEvents).mock.calls[0][0]).toEqual(expect.any(Object))

    const options = vi.mocked(subscribeDocumentEvents).mock.calls[0][1]
    expect(typeof options.eventHandler).toBe('function')

    const event = {type: 'edited', documentId: 'doc1', outgoing: {}} as DocumentEvent
    options.eventHandler(event)
    expect(handleEvent).toHaveBeenCalledWith(event)
  })

  it('calls the unsubscribe function on unmount', () => {
    const handleEvent = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(subscribeDocumentEvents).mockReturnValue(unsubscribe)

    const {unmount} = renderHook(() => useDocumentEvent({...docHandle, onEvent: handleEvent}), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
