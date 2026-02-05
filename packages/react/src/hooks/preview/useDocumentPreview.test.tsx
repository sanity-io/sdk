import {type DocumentHandle, type PreviewQueryResult} from '@sanity/sdk'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {render, renderHook, screen} from '../../../test/test-utils'
import {useDocumentProjection} from '../projection/useDocumentProjection'
import {useDocumentPreview} from './useDocumentPreview'

// Mock useDocumentProjection since useDocumentPreview now uses it internally
vi.mock('../projection/useDocumentProjection')

const mockDocument: DocumentHandle = {
  documentId: 'doc1',
  documentType: 'exampleType',
}

describe('useDocumentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('transforms projection result to preview format', () => {
    const mockProjectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'exampleType',
      _updatedAt: '2024-01-01',
      titleCandidates: {title: 'Test Title'},
      subtitleCandidates: {description: 'Test Description'},
      media: null,
    }

    vi.mocked(useDocumentProjection).mockReturnValue({
      data: mockProjectionResult,
      isPending: false,
    })

    const {result} = renderHook(() => useDocumentPreview(mockDocument))
    const {data, isPending} = result.current
    expect(data?.title).toBe('Test Title')
    expect(data?.subtitle).toBe('Test Description')
    expect(isPending).toBe(false)
  })

  test('handles pending state', () => {
    const mockProjectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'exampleType',
      _updatedAt: '2024-01-01',
      titleCandidates: {title: 'Loading Title'},
      subtitleCandidates: {},
      media: null,
    }

    vi.mocked(useDocumentProjection).mockReturnValue({
      data: mockProjectionResult,
      isPending: true,
    })

    function TestComponent() {
      const {data, isPending} = useDocumentPreview(mockDocument)
      return (
        <div>
          <h1>{data?.title}</h1>
          {isPending && <div>Pending...</div>}
        </div>
      )
    }

    render(<TestComponent />)

    expect(screen.getByText('Loading Title')).toBeInTheDocument()
    expect(screen.getByText('Pending...')).toBeInTheDocument()
  })

  test('uses fallback title when no candidates exist', () => {
    const mockProjectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2024-01-01',
      titleCandidates: {},
      subtitleCandidates: {},
      media: null,
    }

    vi.mocked(useDocumentProjection).mockReturnValue({
      data: mockProjectionResult,
      isPending: false,
    })

    const {result} = renderHook(() => useDocumentPreview(mockDocument))
    const {data} = result.current
    expect(data?.title).toBe('article: doc1')
  })

  test('passes ref to useDocumentProjection', () => {
    const mockProjectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'exampleType',
      _updatedAt: '2024-01-01',
      titleCandidates: {title: 'Title'},
      subtitleCandidates: {},
      media: null,
    }

    vi.mocked(useDocumentProjection).mockReturnValue({
      data: mockProjectionResult,
      isPending: false,
    })

    const ref = {current: null}
    const {result} = renderHook(() => useDocumentPreview({...mockDocument, ref}))
    const {data} = result.current
    expect(data?.title).toBe('Title')

    // Verify useDocumentProjection was called with the ref and preview projection
    expect(useDocumentProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc1',
        documentType: 'exampleType',
        ref: ref,
        projection: expect.any(String),
      }),
    )
  })
})
