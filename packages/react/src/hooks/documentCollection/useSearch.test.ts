import {type DocumentListOptions} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useDocuments} from './useDocuments'
import {useSearch} from './useSearch'

vi.mock('./useDocuments')

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDocuments).mockReturnValue({
      results: [],
      isPending: false,
      hasMore: false,
      count: 0,
      loadMore: vi.fn(),
    })
  })

  it('should pass empty filter when no search parameters provided', () => {
    renderHook(() => useSearch())

    expect(useDocuments).toHaveBeenCalledWith({
      filter: '',
    })
  })

  it('should construct search filter with query', () => {
    renderHook(() => useSearch({query: 'test query'}))

    expect(useDocuments).toHaveBeenCalledWith({
      filter: '[@] match text::query("test query")',
    })
  })

  it('should trim whitespace from query', () => {
    renderHook(() => useSearch({query: '  test query  '}))

    expect(useDocuments).toHaveBeenCalledWith({
      filter: '[@] match text::query("test query")',
    })
  })

  it('should not add search condition if query is empty', () => {
    renderHook(() => useSearch({query: '   '}))

    expect(useDocuments).toHaveBeenCalledWith({
      filter: '',
    })
  })

  it('should combine search query with additional filter', () => {
    renderHook(() =>
      useSearch({
        query: 'test query',
        filter: '_type == "book"',
      }),
    )

    expect(useDocuments).toHaveBeenCalledWith({
      filter: '[@] match text::query("test query") && (_type == "book")',
    })
  })

  it('should pass through other DocumentListOptions', () => {
    const options: DocumentListOptions = {
      sort: [{field: '_createdAt', direction: 'desc'}],
      perspective: 'published',
    }

    renderHook(() =>
      useSearch({
        query: 'test query',
        ...options,
      }),
    )

    expect(useDocuments).toHaveBeenCalledWith({
      filter: '[@] match text::query("test query")',
      ...options,
    })
  })

  it('should return useDocuments result unchanged', () => {
    const mockResult = {
      results: [{_id: 'doc1', _type: 'book'}],
      isPending: false,
      hasMore: true,
      count: 1,
      loadMore: vi.fn(),
    }
    vi.mocked(useDocuments).mockReturnValue(mockResult)

    const {result} = renderHook(() => useSearch({query: 'test'}))

    expect(result.current).toBe(mockResult)
  })
})
