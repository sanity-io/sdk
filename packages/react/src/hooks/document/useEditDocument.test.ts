// tests/useEditDocument.test.ts
import {
  createSanityInstance,
  editDocument,
  getDocumentState,
  resolveDocument,
  type StateSource,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyActions} from './useApplyActions'
import {useEditDocument} from './useEditDocument'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getDocumentState: vi.fn(),
    resolveDocument: vi.fn(),
    editDocument: vi.fn(original.editDocument),
  }
})

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

vi.mock('./useApplyActions', () => ({
  useApplyActions: vi.fn(),
}))

// Create a fake instance to be returned by useSanityInstance.
const instance = createSanityInstance({resources: [{projectId: 'p', dataset: 'd'}]})

const doc = {
  _id: 'doc1',
  foo: 'bar',
  _type: 'book',
  _rev: 'tx0',
  _createdAt: '2025-02-06T00:11:00.000Z',
  _updatedAt: '2025-02-06T00:11:00.000Z',
} satisfies SanityDocument

describe('useEditDocument hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSanityInstance).mockReturnValue(instance)
  })

  it('applies a single edit action for the given path', async () => {
    const getCurrent = vi.fn().mockReturnValue(doc)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx1'})
    vi.mocked(useApplyActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument('doc1', 'foo'))
    const promise = result.current('newValue')
    expect(editDocument).toHaveBeenCalledWith('doc1', {set: {foo: 'newValue'}})
    expect(apply).toHaveBeenCalledWith(editDocument('doc1', {set: {foo: 'newValue'}}))
    const actionsResult = await promise
    expect(actionsResult).toEqual({transactionId: 'tx1'})
  })

  it('applies edit actions for changed fields', async () => {
    // Set up current document state.
    const currentDoc = {...doc, foo: 'bar', extra: 'old'}
    const getCurrent = vi.fn().mockReturnValue(currentDoc)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx2'})
    vi.mocked(useApplyActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument('doc1'))
    const promise = result.current({...doc, foo: 'baz', extra: 'old', _id: 'doc1'})
    expect(apply).toHaveBeenCalledWith([editDocument('doc1', {set: {foo: 'baz'}})])
    const actionsResult = await promise
    expect(actionsResult).toEqual({transactionId: 'tx2'})
  })

  it('applies a single edit action using an updater function for the given path', async () => {
    const getCurrent = vi.fn().mockReturnValue(doc.foo)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx3'})
    vi.mocked(useApplyActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument('doc1', 'foo'))
    const promise = result.current((prev: unknown) => `${prev}Updated`) // 'bar' becomes 'barUpdated'
    expect(editDocument).toHaveBeenCalledWith('doc1', {set: {foo: 'barUpdated'}})
    expect(apply).toHaveBeenCalledWith(editDocument('doc1', {set: {foo: 'barUpdated'}}))
    const actionsResult = await promise
    expect(actionsResult).toEqual({transactionId: 'tx3'})
  })

  it('applies edit actions using an updater function for the entire document', async () => {
    const currentDoc = {...doc, foo: 'bar', extra: 'old'}
    const getCurrent = vi.fn().mockReturnValue(currentDoc)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx4'})
    vi.mocked(useApplyActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument('doc1'))
    const promise = result.current((prevDoc) => ({...prevDoc, foo: 'baz'}))
    expect(apply).toHaveBeenCalledWith([editDocument('doc1', {set: {foo: 'baz'}})])
    const actionsResult = await promise
    expect(actionsResult).toEqual({transactionId: 'tx4'})
  })

  it('throws an error if next value is not an object', () => {
    const getCurrent = vi.fn().mockReturnValue(doc)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const fakeApply = vi.fn()
    vi.mocked(useApplyActions).mockReturnValue(fakeApply)

    const {result} = renderHook(() => useEditDocument('doc1'))
    expect(() => result.current('notAnObject' as unknown as SanityDocument)).toThrowError(
      'No path was provided to `useEditDocument` and the value provided was not a document object.',
    )
  })

  it('throws a promise (suspends) when the document is not ready', () => {
    const getCurrent = vi.fn().mockReturnValue(undefined)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<unknown>)

    const resolveDocPromise = Promise.resolve(doc)

    // Also, simulate resolveDocument to return a known promise.
    vi.mocked(resolveDocument).mockReturnValue(resolveDocPromise)

    // Render the hook and capture the thrown promise.
    const {result} = renderHook(() => {
      try {
        return useEditDocument('doc1')
      } catch (e) {
        return e
      }
    })

    // When the document is not ready, the hook throws the promise from resolveDocument.
    expect(result.current).toBe(resolveDocPromise)
  })
})
