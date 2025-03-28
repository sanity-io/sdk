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

const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
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
    const handler = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(subscribeDocumentEvents).mockReturnValue(unsubscribe)

    renderHook(() => useDocumentEvent(handler, docHandle))

    expect(vi.mocked(subscribeDocumentEvents)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(subscribeDocumentEvents).mock.calls[0][0]).toBe(instance)

    const stableHandler = vi.mocked(subscribeDocumentEvents).mock.calls[0][1]
    expect(typeof stableHandler).toBe('function')

    const event = {type: 'edited', documentId: 'doc1', outgoing: {}} as DocumentEvent
    stableHandler(event)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('calls the unsubscribe function on unmount', () => {
    const handler = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(subscribeDocumentEvents).mockReturnValue(unsubscribe)

    const {unmount} = renderHook(() => useDocumentEvent(handler, docHandle))
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
