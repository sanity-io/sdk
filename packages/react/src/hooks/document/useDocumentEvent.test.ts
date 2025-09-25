// tests/useDocumentEvent.test.ts
import {
  createSanityInstance,
  type DocumentEvent,
  type DocumentHandle,
  subscribeDocumentEvents,
} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useDocumentEvent} from './useDocumentEvent'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, subscribeDocumentEvents: vi.fn()}
})

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

const instance = createSanityInstance()
const docHandle: DocumentHandle = {
  documentId: 'doc1',
  documentType: 'book',
}

describe('useDocumentEvent hook', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(useSanityInstance).mockReturnValue(instance)
  })

  it('calls subscribeDocumentEvents with instance and a stable handler', () => {
    const handleEvent = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(subscribeDocumentEvents).mockReturnValue(unsubscribe)

    renderHook(() => useDocumentEvent({...docHandle, onEvent: handleEvent}))

    expect(vi.mocked(subscribeDocumentEvents)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(subscribeDocumentEvents).mock.calls[0][0]).toBe(instance)

    const stableHandler = vi.mocked(subscribeDocumentEvents).mock.calls[0][1].onEvent
    expect(typeof stableHandler).toBe('function')

    const event = {type: 'edited', documentId: 'doc1', outgoing: {}} as DocumentEvent
    stableHandler(event)
    expect(handleEvent).toHaveBeenCalledWith(event)
  })

  it('calls the unsubscribe function on unmount', () => {
    const handleEvent = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(subscribeDocumentEvents).mockReturnValue(unsubscribe)

    const {unmount} = renderHook(() => useDocumentEvent({...docHandle, onEvent: handleEvent}))
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
