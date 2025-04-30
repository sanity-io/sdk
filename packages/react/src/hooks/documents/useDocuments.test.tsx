import {type SanityInstance} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {describe, vi} from 'vitest'

import {evaluateSync, parse} from '../_synchronous-groq-js.mjs'
import {useSanityInstance} from '../context/useSanityInstance'
import {useQuery} from '../query/useQuery'
import {useDocuments} from './useDocuments'

vi.mock('../query/useQuery')
vi.mock('../context/useSanityInstance')

describe('useDocuments', () => {
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
    vi.mocked(useSanityInstance).mockReturnValue({config: {}} as SanityInstance)
  })

  it('should respect custom page size', () => {
    const customBatchSize = 2
    const {result} = renderHook(() => useDocuments({batchSize: customBatchSize}))

    expect(result.current.data.length).toBe(customBatchSize)
  })

  it('should filter by document type', () => {
    const {result} = renderHook(() => useDocuments({filter: '_type == "movie"'}))

    expect(result.current.data.every((doc) => doc.documentType === 'movie')).toBe(true)
    expect(result.current.count).toBe(5) // 5 movies in the dataset
  })

  // groq-js doesn't support search filters yet
  it.skip('should apply search filter', () => {
    const {result} = renderHook(() => useDocuments({search: 'inter'}))

    // Should match "Interstellar"
    expect(result.current.data.some((doc) => doc.documentId === 'movie3')).toBe(true)
  })

  it('should apply ordering', () => {
    const {result} = renderHook(() =>
      useDocuments({
        filter: '_type == "movie"',
        orderings: [{field: 'releaseYear', direction: 'desc'}],
      }),
    )

    // First item should be the most recent movie (Interstellar, 2014)
    expect(result.current.data[0].documentId).toBe('movie3')
  })

  it('should load more data when loadMore is called', () => {
    const batchSize = 2
    const {result} = renderHook(() => useDocuments({batchSize: batchSize}))

    expect(result.current.data.length).toBe(batchSize)

    act(() => {
      result.current.loadMore()
    })

    expect(result.current.data.length).toBe(batchSize * 2)
  })

  it('should indicate when there is more data to load', () => {
    const {result} = renderHook(() => useDocuments({batchSize: 3}))
    expect(result.current.hasMore).toBe(true)
    // Load all remaining data
    act(() => {
      result.current.loadMore()
    })
    expect(result.current.hasMore).toBe(false)
  })

  // New test case for resetting limit when filter changes
  it('should reset limit when filter changes', () => {
    const {result, rerender} = renderHook((props) => useDocuments(props), {
      initialProps: {batchSize: 2, filter: ''},
    })
    // Initially, data length equals pageSize (2)
    expect(result.current.data.length).toBe(2)
    // Load more to increase limit
    act(() => {
      result.current.loadMore()
    })
    // After loadMore, data length should be increased (2 + 2 = 4)
    expect(result.current.data.length).toBe(4)
    // Now update filter to trigger resetting the limit
    rerender({batchSize: 2, filter: '_type == "movie"'})
    // With the filter applied, the limit is reset to pageSize (i.e. 2)
    expect(result.current.data.length).toBe(2)
  })

  it('should add projectId and dataset to document handles', () => {
    // Update the mock to include specific projectId and dataset
    vi.mocked(useSanityInstance).mockReturnValue({
      config: {
        projectId: 'test-project',
        dataset: 'test-dataset',
      },
    } as SanityInstance)

    const {result} = renderHook(() => useDocuments({}))

    // Check that the first document handle has the projectId and dataset
    expect(result.current.data[0].projectId).toBe('test-project')
    expect(result.current.data[0].dataset).toBe('test-dataset')

    // Verify all document handles have these properties
    expect(
      result.current.data.every(
        (doc) => doc.projectId === 'test-project' && doc.dataset === 'test-dataset',
      ),
    ).toBe(true)
  })
})
