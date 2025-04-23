// tests/useDocument.test.ts
import {
  createDocumentHandle,
  createSanityInstance,
  getDocumentState,
  resolveDocument,
  type StateSource,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {renderHook} from '@testing-library/react'
import {type DatasetScoped} from 'groq'
import {beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useDocument} from './useDocument'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, getDocumentState: vi.fn(), resolveDocument: vi.fn()}
})

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

// Define a single generic TestDocument type
type UseDocumentTestType = DatasetScoped<
  SanityDocument & {
    _type: 'use-document-test-type'
    foo?: string
    extra?: boolean
    title?: string
    nested?: {
      value?: number
    }
  },
  'use-document-test-dataset',
  'p'
>

type UseDocumentTestTypeAlt = DatasetScoped<
  SanityDocument & {
    _type: 'use-document-test-type'
    bar: string[]
    nested?: {
      value?: number
    }
  },
  'use-document-test-alt-dataset',
  'p'
>

// Scope the TestDocument type to the project/datasets used in tests

declare module 'groq' {
  interface SanitySchemas {
    'p:use-document-test-dataset': UseDocumentTestType
    'p:use-document-test-alt-dataset': UseDocumentTestTypeAlt
  }
}

// Create a fake instance to be returned by useSanityInstance.
const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
const book: SanityDocument = {
  _id: 'doc1',
  foo: 'bar',
  _type: 'book',
  _rev: 'tx0',
  _createdAt: '2025-02-06T00:11:00.000Z',
  _updatedAt: '2025-02-06T00:11:00.000Z',
}

describe('useDocument hook', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(useSanityInstance).mockReturnValue(instance)
  })

  it('returns the current document when ready (without a path)', () => {
    const getCurrent = vi.fn().mockReturnValue(book)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<unknown>)

    const {result} = renderHook(() => useDocument({documentId: 'doc1', documentType: 'book'}))

    expect(result.current).toEqual(book)
    expect(getCurrent).toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalled()
  })

  it('throws a promise (suspends) when the document is not ready', () => {
    const getCurrent = vi.fn().mockReturnValue(undefined)
    const subscribe = vi.fn().mockReturnValue(vi.fn())
    vi.mocked(getDocumentState).mockReturnValue({
      getCurrent,
      subscribe,
    } as unknown as StateSource<unknown>)

    const resolveDocPromise = Promise.resolve(book)

    // Also, simulate resolveDocument to return a known promise.
    vi.mocked(resolveDocument).mockReturnValue(resolveDocPromise)

    // Render the hook and capture the thrown promise.
    const {result} = renderHook(() => {
      try {
        return useDocument({documentId: 'doc1', documentType: 'book'})
      } catch (e) {
        return e
      }
    })

    // When the document is not ready, the hook throws the promise from resolveDocument.
    expect(result.current).toBe(resolveDocPromise)
  })
})

describe('useDocuments types', () => {
  describe('Type Inference', () => {
    it('infers full document type when no path is provided', () => {
      const doc = createDocumentHandle({
        documentId: 'id',
        documentType: 'use-document-test-type',
        dataset: 'use-document-test-dataset',
        projectId: 'p',
      })
      const x = useDocument(doc)
      // Assuming the hook is called within a component context for the test
      expectTypeOf(x).toEqualTypeOf<UseDocumentTestType | null>()
    })

    it('infers nested string type when path is provided', () => {
      const doc = createDocumentHandle({
        documentId: 'id',
        documentType: 'use-document-test-type',
        dataset: 'use-document-test-dataset',
      })
      const x = useDocument({...doc, path: 'title'})
      // Path points to 'title' which is string?
      expectTypeOf(x).toEqualTypeOf<string | undefined>()
      expectTypeOf(useDocument({...doc, path: 'extra'})).toEqualTypeOf<boolean | undefined>()
    })

    it('infers nested object type when path is provided', () => {
      const doc = createDocumentHandle({
        documentId: 'id',
        documentType: 'use-document-test-type',
      })

      expectTypeOf(useDocument({...doc, path: 'nested'})).toEqualTypeOf<
        UseDocumentTestType['nested']
      >()
    })

    it('infers deeply nested type when path is provided', () => {
      const doc = createDocumentHandle({
        documentId: 'id',
        documentType: 'use-document-test-type',
      })

      // Path points to 'nested.value' which is number?
      // Test useDocument *with* the path
      expectTypeOf(useDocument({...doc, path: 'nested.value'})).toEqualTypeOf<number | undefined>()
    })

    it('infers undefined for invalid paths', () => {
      const doc = createDocumentHandle({
        documentId: 'id',
        documentType: 'use-document-test-type',
      })
      // Path points to a non-existent field. DeepGet resolves to undefined.
      expectTypeOf(useDocument({...doc, path: 'invalid.path'})).toEqualTypeOf<undefined>()
    })

    it('infers correctly with explicit project/dataset in handle', () => {
      const doc = createDocumentHandle({
        documentId: 'id',
        documentType: 'use-document-test-type',
        projectId: 'p',
        dataset: 'use-document-test-alt-dataset',
      })

      expectTypeOf(useDocument(doc)).toEqualTypeOf<UseDocumentTestTypeAlt | null>()
    })
  })

  // --- Explicit Typing ---
  describe('Explicit Typing', () => {
    interface ExplicitBook {
      _id: string
      _type: 'book'
      title: string
      pages: number
    }

    it('accepts explicit type for full document', () => {
      const doc = createDocumentHandle({
        documentId: 'id',
        documentType: 'explicit-book',
      })
      expectTypeOf(useDocument<ExplicitBook>(doc)).toEqualTypeOf<ExplicitBook | null>()
    })

    it('accepts explicit type for nested value', () => {
      const doc = createDocumentHandle({
        documentId: 'id',
        documentType: 'explicit-book',
      })
      // Explicitly providing string for the title path
      // Expect undefined if path value is missing or document not ready
      expectTypeOf(useDocument<string>({...doc, path: 'title'})).toEqualTypeOf<string | undefined>()
    })
  })
})
