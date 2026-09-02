// tests/useEditDocument.test.ts
import {
  createDocumentHandle,
  editDocument,
  getDocumentState,
  resolveDocument,
  type StateSource,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useApplyDocumentActions} from './useApplyDocumentActions'
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

vi.mock('./useApplyDocumentActions', () => ({
  useApplyDocumentActions: vi.fn(),
}))

const doc = {
  _id: 'doc1',
  foo: 'bar',
  _type: 'book',
  _rev: 'tx0',
  _createdAt: '2025-02-06T00:11:00.000Z',
  _updatedAt: '2025-02-06T00:11:00.000Z',
} satisfies Book

const docHandle = createDocumentHandle({
  documentId: 'doc1',
  documentType: 'book',
})

const normalizedDoc = {
  ...docHandle,
  resource: {projectId: 'test', dataset: 'test'},
}

// An edit that changes nothing sends no action handles, so the resource travels
// on its own.
const resourceOptions = {resource: normalizedDoc.resource}

// Define a single generic TestDocument type
interface Book extends SanityDocument {
  _type: 'book'
  foo?: string
  extra?: string
  title?: string
  body?: {_key: string; text: string}[]
}

// Scope the TestDocument type to the project/datasets used in tests
type AllTestSchemaTypes = Book

// Augment the 'groq' module
declare module 'groq' {
  interface SanitySchemas {
    'default:default': AllTestSchemaTypes
  }
}

describe('useEditDocument hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies a single edit action for the given path', async () => {
    const getCurrent = vi.fn().mockReturnValue(doc)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx1'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument<string>({...docHandle, path: 'foo'}))
    const promise = result.current('newValue')
    expect(editDocument).toHaveBeenCalledWith(normalizedDoc, {set: {foo: 'newValue'}})
    expect(apply).toHaveBeenCalledWith(editDocument(normalizedDoc, {set: {foo: 'newValue'}}))
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
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument(docHandle))
    const promise = result.current({...doc, foo: 'baz', extra: 'old', _id: 'doc1'})
    expect(apply).toHaveBeenCalledWith(
      [editDocument(normalizedDoc, {set: {foo: 'baz'}})],
      resourceOptions,
    )
    const actionsResult = await promise
    expect(actionsResult).toEqual({transactionId: 'tx2'})
  })

  it('ignores fields that are only new copies of the value already stored', async () => {
    const currentDoc = {...doc, title: 'Dune', body: [{_key: 'a', text: 'Arrakis'}]} satisfies Book
    const getCurrent = vi.fn().mockReturnValue(currentDoc)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx5'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    // A caller that re-parses or clones hands back fresh references for every
    // object and array; only `title` changed.
    const reparsed = JSON.parse(JSON.stringify({...currentDoc, title: 'Dune Messiah'})) as Book

    const {result} = renderHook(() => useEditDocument(docHandle))
    await result.current(reparsed)

    expect(apply).toHaveBeenCalledWith(
      [editDocument(normalizedDoc, {set: {title: 'Dune Messiah'}})],
      resourceOptions,
    )
  })

  it('applies no actions when the whole document is unchanged', async () => {
    const currentDoc = {...doc, body: [{_key: 'a', text: 'Arrakis'}]} satisfies Book
    const getCurrent = vi.fn().mockReturnValue(currentDoc)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx6'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument(docHandle))
    await result.current(JSON.parse(JSON.stringify(currentDoc)) as Book)

    expect(editDocument).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledWith([], resourceOptions)
  })

  it('applies no actions when a path is set to the value it already holds', async () => {
    const currentValue = [{_key: 'a', text: 'Arrakis'}]
    const getCurrent = vi.fn().mockReturnValue(currentValue)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx7'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument<Book['body']>({...docHandle, path: 'body'}))
    await result.current(JSON.parse(JSON.stringify(currentValue)) as Book['body'])

    expect(editDocument).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledWith([], resourceOptions)
  })

  it('applies a single edit action using an updater function for the given path', async () => {
    const getCurrent = vi.fn().mockReturnValue(doc.foo)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<SanityDocument>)

    const apply = vi.fn().mockResolvedValue({transactionId: 'tx3'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument<string>({...docHandle, path: 'foo'}))
    const promise = result.current((prev: unknown) => `${prev}Updated`) // 'bar' becomes 'barUpdated'
    expect(editDocument).toHaveBeenCalledWith(normalizedDoc, {set: {foo: 'barUpdated'}})
    expect(apply).toHaveBeenCalledWith(editDocument(normalizedDoc, {set: {foo: 'barUpdated'}}))
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
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useEditDocument(docHandle))
    const promise = result.current((prevDoc: Book) => ({...prevDoc, foo: 'baz'}))
    expect(apply).toHaveBeenCalledWith(
      [editDocument(normalizedDoc, {set: {foo: 'baz'}})],
      resourceOptions,
    )
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
    vi.mocked(useApplyDocumentActions).mockReturnValue(fakeApply)

    const {result} = renderHook(() => useEditDocument(docHandle))
    expect(() => result.current('notAnObject' as unknown as Book)).toThrowError(
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
        return useEditDocument(docHandle)
      } catch (e) {
        return e
      }
    })

    // When the document is not ready, the hook throws the promise from resolveDocument.
    expect(result.current).toBe(resolveDocPromise)
  })
})
