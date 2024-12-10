import {createDocumentListStore} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useDocuments, type UseDocumentsOptions} from './useDocuments'

vi.mock('@sanity/sdk')
vi.mock('../context/useSanityInstance')

describe('useDocuments', () => {
  const mockInstance = {}
  const mockDocumentListStore = {
    setOptions: vi.fn(),
    subscribe: vi.fn((_: {next: () => void}) => {
      return {unsubscribe: vi.fn()}
    }),
    getCurrent: vi.fn(),
    loadMore: vi.fn(),
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
    const options: UseDocumentsOptions = {
      filter: 'some-filter',
      sort: [{field: 'name', direction: 'asc'}],
    }
    renderHook(() => useDocuments(options))

    expect(createDocumentListStore).toHaveBeenCalledWith(mockInstance)
    expect(mockDocumentListStore.setOptions).toHaveBeenCalledWith(options)
  })

  it('should subscribe to document list store changes', () => {
    const options: UseDocumentsOptions = {}
    mockDocumentListStore.subscribe.mockImplementation(() => {
      return {unsubscribe: vi.fn()}
    })

    renderHook(() => useDocuments(options))

    expect(mockDocumentListStore.subscribe).toHaveBeenCalledTimes(1)
    expect(mockDocumentListStore.subscribe.mock.calls.length).toBe(1)
  })

  it('should return the current document list state', () => {
    const options = {}
    const currentState = {result: [], isPending: false}
    mockDocumentListStore.getCurrent.mockReturnValue(currentState)

    const {result} = renderHook(() => useDocuments(options))

    expect(result.current).toEqual({
      ...currentState,
      loadMore: mockDocumentListStore.loadMore,
    })
  })

  it('should call loadMore when loadMore is invoked', () => {
    const options = {}
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
    let currentState: {result: {id: string}[]; isPending: boolean} = {result: [], isPending: true}
    const newState = {result: [{id: 'doc1'}], isPending: false}

    // Mock the `getCurrent` function
    mockDocumentListStore.getCurrent.mockImplementation(() => currentState)
    // Simulate a state change by updating `currentState` reference
    currentState = newState

    const {result} = renderHook(() => useDocuments(options as UseDocumentsOptions))

    expect(result.current).toEqual({
      ...newState,
      loadMore: mockDocumentListStore.loadMore,
    })
  })

  it('should handle empty options', () => {
    const options = {}
    renderHook(() => useDocuments(options))

    expect(createDocumentListStore).toHaveBeenCalledWith(mockInstance)
    expect(mockDocumentListStore.setOptions).toHaveBeenCalledWith(options)
  })

  it('should handle null result from document list store', () => {
    const options = {}
    mockDocumentListStore.getCurrent.mockReturnValue({result: null, isPending: false})

    const {result} = renderHook(() => useDocuments(options))

    expect(result.current).toEqual({
      result: null,
      isPending: false,
      loadMore: mockDocumentListStore.loadMore,
    })
  })
})
