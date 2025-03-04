import {createDocumentListStore, type DocumentListOptions} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useDocuments} from './useDocuments'

vi.mock('@sanity/sdk')
vi.mock('../context/useSanityInstance')

describe('useDocuments', () => {
  const mockInstance = {}

  const getCurrent = vi.fn()
  const unsubscribe = vi.fn()
  const subscribe = vi.fn().mockReturnValue(unsubscribe)
  const dispose = vi.fn()

  const mockDocumentListStore: ReturnType<typeof createDocumentListStore> = {
    setOptions: vi.fn(),
    loadMore: vi.fn(),
    getState: vi.fn().mockReturnValue({getCurrent, subscribe}),
    dispose,
  }

  beforeEach(() => {
    vi.mocked(useSanityInstance).mockReturnValue(
      mockInstance as unknown as ReturnType<typeof useSanityInstance>,
    )
    vi.mocked(createDocumentListStore).mockReturnValue(
      mockDocumentListStore as unknown as ReturnType<typeof createDocumentListStore>,
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with given options', () => {
    const options: DocumentListOptions = {
      datasetResourceId: 'ppsg7ml5:test',
      filter: 'some-filter',
      sort: [{field: 'name', direction: 'asc'}],
    }
    renderHook(() => useDocuments(options))

    expect(createDocumentListStore).toHaveBeenCalledWith(mockInstance, 'ppsg7ml5:test')
    expect(mockDocumentListStore.setOptions).toHaveBeenCalledWith(options)
  })

  it('should subscribe to document list store changes', () => {
    const options: DocumentListOptions = {
      datasetResourceId: 'ppsg7ml5:test',
    }

    renderHook(() => useDocuments(options))
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('should return the current document list state', () => {
    const options: DocumentListOptions = {
      datasetResourceId: 'ppsg7ml5:test',
    }
    const currentState = {result: [], isPending: false}
    getCurrent.mockReturnValue(currentState)

    const {result} = renderHook(() => useDocuments(options))
    expect(result.current).toMatchObject(currentState)
  })

  it('should call loadMore when loadMore is invoked', () => {
    const options: DocumentListOptions = {
      datasetResourceId: 'ppsg7ml5:test',
    }
    const {result} = renderHook(() => useDocuments(options))

    act(() => {
      result.current.loadMore()
    })

    expect(mockDocumentListStore.loadMore).toHaveBeenCalled()
  })

  it('should update state when document list store changes', () => {
    const options = {
      filter: 'some-filter',
      sort: [{field: 'name', direction: 'asc'}],
    }
    getCurrent.mockReturnValue({results: [], isPending: true})
    const {result, rerender} = renderHook(() => useDocuments(options as DocumentListOptions))

    expect(subscribe).toHaveBeenCalledTimes(1)
    const [subscriber] = subscribe.mock.calls[0]

    const newState = {results: [{id: 'doc1'}], isPending: false}
    getCurrent.mockReturnValue(newState)

    act(() => {
      subscriber()
      rerender()
    })

    expect(result.current).toMatchObject(newState)
  })

  it('should handle null result from document list store', () => {
    const options: DocumentListOptions = {
      datasetResourceId: 'ppsg7ml5:test',
    }
    getCurrent.mockReturnValue({result: null, isPending: false})

    const {result} = renderHook(() => useDocuments(options))

    expect(result.current).toMatchObject({
      result: null,
      isPending: false,
    })
  })

  it('should unsubscribe from document list store on unmount', () => {
    const options: DocumentListOptions = {
      datasetResourceId: 'ppsg7ml5:test',
    }
    const unsubscribeSpy = vi.fn()
    subscribe.mockReturnValue(unsubscribeSpy)

    const {unmount} = renderHook(() => useDocuments(options))

    unmount()
    expect(mockDocumentListStore.dispose).toHaveBeenCalled()
    expect(unsubscribeSpy).toHaveBeenCalled()
  })
})
