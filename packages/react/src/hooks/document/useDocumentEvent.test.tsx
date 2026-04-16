// tests/useDocumentEvent.test.ts
import {type DocumentEvent, type DocumentHandle, onDocumentEvent} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useDocumentEvent} from './useDocumentEvent'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, onDocumentEvent: vi.fn()}
})

const docHandle: DocumentHandle = {
  documentId: 'doc1',
  documentType: 'book',
  resource: {projectId: 'p', dataset: 'd'},
}

describe('useDocumentEvent hook', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('calls onDocumentEvent with instance and a stable handler', () => {
    const handleEvent = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(onDocumentEvent).mockReturnValue(unsubscribe)

    renderHook(() => useDocumentEvent({...docHandle, onEvent: handleEvent}))

    expect(vi.mocked(onDocumentEvent)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(onDocumentEvent).mock.calls[0][0]).toEqual(expect.any(Object))

    const options = vi.mocked(onDocumentEvent).mock.calls[0][1]
    expect(typeof options.eventHandler).toBe('function')

    const event = {type: 'edited', documentId: 'doc1', outgoing: {}} as DocumentEvent
    options.eventHandler(event)
    expect(handleEvent).toHaveBeenCalledWith(event)
  })

  it('calls the unsubscribe function on unmount', () => {
    const handleEvent = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(onDocumentEvent).mockReturnValue(unsubscribe)

    const {unmount} = renderHook(() => useDocumentEvent({...docHandle, onEvent: handleEvent}))
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
