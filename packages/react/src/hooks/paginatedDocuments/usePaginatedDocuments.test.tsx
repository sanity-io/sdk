import {act, renderHook} from '@testing-library/react'
import {describe, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {evaluateSync, parse} from '../_synchronous-groq-js.mjs'
import {useQuery} from '../query/useQuery'
import {usePaginatedDocuments} from './usePaginatedDocuments'

vi.mock('../query/useQuery')

describe('usePaginatedDocuments', () => {
  const wrapper = ({children}: {children: React.ReactNode}) => (
    <ResourceProvider projectId="p" dataset="d" fallback={null}>
      {children}
    </ResourceProvider>
  )

  beforeEach(() => {
    const dataset = [
      {
        _id: 'movie1',
        _type: 'movie',
        title: 'The Matrix',
        releaseYear: 1999,
        _createdAt: '2021-03-09T00:00:00.000Z',
        _updatedAt: '2021-03-09T00:00:00.000Z',
        _rev: 'tx0',
      },
      {
        _id: 'movie2',
        _type: 'movie',
        title: 'Inception',
        releaseYear: 2010,
        _createdAt: '2021-03-10T00:00:00.000Z',
        _updatedAt: '2021-03-10T00:00:00.000Z',
        _rev: 'tx1',
      },
      {
        _id: 'movie3',
        _type: 'movie',
        title: 'Interstellar',
        releaseYear: 2014,
        _createdAt: '2021-03-11T00:00:00.000Z',
        _updatedAt: '2021-03-11T00:00:00.000Z',
        _rev: 'tx2',
      },
      {
        _id: 'book1',
        _type: 'book',
        title: 'Dune',
        _createdAt: '2021-03-12T00:00:00.000Z',
        _updatedAt: '2021-03-12T00:00:00.000Z',
        _rev: 'tx3',
      },
      {
        _id: 'movie4',
        _type: 'movie',
        title: 'The Dark Knight',
        releaseYear: 2008,
        _createdAt: '2021-03-13T00:00:00.000Z',
        _updatedAt: '2021-03-13T00:00:00.000Z',
        _rev: 'tx4',
      },
      {
        _id: 'movie5',
        _type: 'movie',
        title: 'Pulp Fiction',
        releaseYear: 1994,
        _createdAt: '2021-03-14T00:00:00.000Z',
        _updatedAt: '2021-03-14T00:00:00.000Z',
        _rev: 'tx5',
      },
    ]

    vi.mocked(useQuery).mockImplementation(({query, ...options}) => {
      const result = evaluateSync(parse(query), {dataset, params: options?.params}).get()
      return {
        data: result,
        isPending: false,
      }
    })
  })

  it('should respect custom page size', () => {
    const customPageSize = 2
    const {result} = renderHook(() => usePaginatedDocuments({pageSize: customPageSize}), {wrapper})

    expect(result.current.pageSize).toBe(customPageSize)
    expect(result.current.data.length).toBeLessThanOrEqual(customPageSize)
  })

  it('should filter by document type', () => {
    const {result} = renderHook(() => usePaginatedDocuments({filter: '_type == "movie"'}), {
      wrapper,
    })

    expect(result.current.data.every((doc) => doc.documentType === 'movie')).toBe(true)
    expect(result.current.count).toBe(5) // 5 movies in the dataset
  })

  // groq-js doesn't support search filters yet
  it.skip('should apply search filter', () => {
    const {result} = renderHook(() => usePaginatedDocuments({search: 'inter'}), {wrapper})

    // Should match "Interstellar"
    expect(result.current.data.some((doc) => doc.documentId === 'movie3')).toBe(true)
  })

  it('should apply ordering', () => {
    const {result} = renderHook(
      () =>
        usePaginatedDocuments({
          filter: '_type == "movie"',
          orderings: [{field: 'releaseYear', direction: 'desc'}],
        }),
      {wrapper},
    )

    // First item should be the most recent movie (Interstellar, 2014)
    expect(result.current.data[0].documentId).toBe('movie3')
  })

  it('should calculate pagination values correctly', () => {
    const pageSize = 2
    const {result} = renderHook(() => usePaginatedDocuments({pageSize}), {wrapper})

    expect(result.current.currentPage).toBe(1)
    expect(result.current.totalPages).toBe(3) // 6 items with page size 2
    expect(result.current.startIndex).toBe(0)
    expect(result.current.endIndex).toBe(2)
    expect(result.current.count).toBe(6)
  })

  it('should navigate to next page', () => {
    const pageSize = 2
    const {result} = renderHook(() => usePaginatedDocuments({pageSize}), {wrapper})

    expect(result.current.currentPage).toBe(1)
    expect(result.current.data.length).toBe(pageSize)

    act(() => {
      result.current.nextPage()
    })

    expect(result.current.currentPage).toBe(2)
    expect(result.current.startIndex).toBe(pageSize)
    expect(result.current.endIndex).toBe(pageSize * 2)
  })

  it('should navigate to previous page', () => {
    const pageSize = 2
    const {result} = renderHook(() => usePaginatedDocuments({pageSize}), {wrapper})

    // Go to page 2 first
    act(() => {
      result.current.nextPage()
    })

    expect(result.current.currentPage).toBe(2)

    // Then go back to page 1
    act(() => {
      result.current.previousPage()
    })

    expect(result.current.currentPage).toBe(1)
    expect(result.current.startIndex).toBe(0)
  })

  it('should navigate to first page', () => {
    const pageSize = 2
    const {result} = renderHook(() => usePaginatedDocuments({pageSize}), {wrapper})

    // Go to last page first
    act(() => {
      result.current.lastPage()
    })

    expect(result.current.currentPage).toBe(3) // Last page (3rd page)

    // Then go back to first page
    act(() => {
      result.current.firstPage()
    })

    expect(result.current.currentPage).toBe(1)
    expect(result.current.startIndex).toBe(0)
  })

  it('should navigate to last page', () => {
    const pageSize = 2
    const {result} = renderHook(() => usePaginatedDocuments({pageSize}), {wrapper})

    act(() => {
      result.current.lastPage()
    })

    expect(result.current.currentPage).toBe(3) // Last page (3rd page)
    expect(result.current.startIndex).toBe(4) // Index 4-5 for the last page
  })

  it('should navigate to specific page', () => {
    const pageSize = 2
    const {result} = renderHook(() => usePaginatedDocuments({pageSize}), {wrapper})

    act(() => {
      result.current.goToPage(2) // Go to page 2
    })

    expect(result.current.currentPage).toBe(2)
    expect(result.current.startIndex).toBe(2) // Index 2-3 for page 2

    // Should not navigate to invalid page numbers
    act(() => {
      result.current.goToPage(0) // Invalid page
    })

    expect(result.current.currentPage).toBe(2) // Should remain on page 2

    act(() => {
      result.current.goToPage(10) // Invalid page
    })

    expect(result.current.currentPage).toBe(2) // Should remain on page 2
  })

  it('should set page availability flags correctly', () => {
    const pageSize = 2
    const {result} = renderHook(() => usePaginatedDocuments({pageSize}), {wrapper})
    // On first page
    expect(result.current.hasFirstPage).toBe(false)
    expect(result.current.hasPreviousPage).toBe(false)
    expect(result.current.hasNextPage).toBe(true)
    expect(result.current.hasLastPage).toBe(true)
    // Go to middle page
    act(() => {
      result.current.nextPage()
    })
    expect(result.current.hasFirstPage).toBe(true)
    expect(result.current.hasPreviousPage).toBe(true)
    expect(result.current.hasNextPage).toBe(true)
    expect(result.current.hasLastPage).toBe(true)
    // Go to last page
    act(() => {
      result.current.lastPage()
    })
    expect(result.current.hasFirstPage).toBe(true)
    expect(result.current.hasPreviousPage).toBe(true)
    expect(result.current.hasNextPage).toBe(false)
    expect(result.current.hasLastPage).toBe(false)
  })

  // New test case for resetting the current page when filter changes
  it('should reset current page when filter changes', () => {
    const {result, rerender} = renderHook((props) => usePaginatedDocuments(props), {
      initialProps: {pageSize: 2, filter: ''},
      wrapper,
    })
    // Initially, current page should be 1
    expect(result.current.currentPage).toBe(1)
    // Navigate to next page
    act(() => {
      result.current.nextPage()
    })
    expect(result.current.currentPage).toBe(2)
    // Now update filter, which should reset the page to the first page
    rerender({pageSize: 2, filter: '_type == "movie"'})
    expect(result.current.currentPage).toBe(1)
    expect(result.current.startIndex).toBe(0)
  })

  it('should add projectId and dataset to document handles', () => {
    const {result} = renderHook(() => usePaginatedDocuments({}), {wrapper})

    // Check that the first document handle has the projectId and dataset
    expect(result.current.data[0].projectId).toBe('p')
    expect(result.current.data[0].dataset).toBe('d')

    // Verify all document handles have these properties
    expect(result.current.data.every((doc) => doc.projectId === 'p' && doc.dataset === 'd')).toBe(
      true,
    )
  })
})
