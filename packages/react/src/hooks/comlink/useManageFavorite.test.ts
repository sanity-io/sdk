import {type Message, type Node, type Status} from '@sanity/comlink'
import {
  type FavoriteStatusResponse,
  getFavoritesState,
  getOrCreateNode,
  resolveFavoritesState,
  type SanityInstance,
} from '@sanity/sdk'
import {BehaviorSubject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {act, renderHook} from '../../../test/test-utils'
import {useSanityInstance} from '../context/useSanityInstance'
import {useManageFavorite} from './useManageFavorite'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getOrCreateNode: vi.fn(),
    releaseNode: vi.fn(),
    getFavoritesState: vi.fn(),
    resolveFavoritesState: vi.fn(),
  }
})

vi.mock('../context/useSanityInstance')

describe('useManageFavorite', () => {
  let node: Node<Message, Message>
  let statusCallback: ((status: Status) => void) | null = null
  let favoriteStatusSubject: BehaviorSubject<FavoriteStatusResponse>

  const mockDocumentHandle = {
    documentId: 'mock-id',
    documentType: 'mock-type',
    resourceType: 'studio' as const,
  }

  function createMockNode() {
    return {
      on: vi.fn(() => () => {}),
      fetch: vi.fn().mockImplementation(() => Promise.resolve({success: true})),
      stop: vi.fn(),
      onStatus: vi.fn((callback) => {
        statusCallback = callback
        return () => {}
      }),
    } as unknown as Node<Message, Message>
  }

  beforeEach(() => {
    statusCallback = null
    favoriteStatusSubject = new BehaviorSubject<FavoriteStatusResponse>({isFavorited: false})
    node = createMockNode()
    vi.mocked(getOrCreateNode).mockReturnValue(node)

    // Mock getFavoritesState
    vi.mocked(getFavoritesState).mockImplementation(() => ({
      subscribe: (callback?: () => void) => {
        if (!callback) return () => {}

        const subscription = favoriteStatusSubject.subscribe(() => callback())
        callback() // Initial call
        return () => subscription.unsubscribe()
      },
      getCurrent: () => favoriteStatusSubject.getValue(),
      observable: favoriteStatusSubject.asObservable(),
    }))

    // Mock resolveFavoritesState
    vi.mocked(resolveFavoritesState).mockImplementation(async () => {
      const newValue = {isFavorited: !favoriteStatusSubject.getValue().isFavorited}
      favoriteStatusSubject.next(newValue)
      return newValue
    })

    // Default mock for useSanityInstance
    vi.mocked(useSanityInstance).mockReturnValue({
      config: {
        projectId: 'test',
        dataset: 'test',
      },
    } as unknown as SanityInstance)
  })

  afterEach(() => {
    favoriteStatusSubject.complete()
    vi.clearAllMocks()
  })

  it('should initialize with default states', () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    expect(result.current.isFavorited).toBe(false)
    expect(result.current.isConnected).toBe(false)
  })

  it('should handle favorite action and update state', async () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    expect(result.current.isFavorited).toBe(false)

    await act(async () => {
      await result.current.favorite()
    })

    expect(node.fetch).toHaveBeenCalledWith(
      'dashboard/v1/events/favorite/mutate',
      {
        document: {
          id: 'mock-id',
          type: 'mock-type',
          resource: {
            id: 'test.test',
            type: 'studio',
          },
        },
        eventType: 'added',
      },
      // empty options object (from useWindowConnection)
      {},
    )
    expect(resolveFavoritesState).toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(true)
  })

  it('should handle unfavorite action and update state', async () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    // Set initial state to favorited
    await act(async () => {
      favoriteStatusSubject.next({isFavorited: true})
    })

    expect(result.current.isFavorited).toBe(true)

    await act(async () => {
      await result.current.unfavorite()
    })

    expect(node.fetch).toHaveBeenCalledWith(
      'dashboard/v1/events/favorite/mutate',
      {
        document: {
          id: 'mock-id',
          type: 'mock-type',
          resource: {
            id: 'test.test',
            type: 'studio',
          },
        },
        eventType: 'removed',
      },
      {},
    )
    expect(resolveFavoritesState).toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(false)
  })

  it('should not update state if favorite action fails', async () => {
    vi.mocked(node.fetch).mockImplementationOnce(() => Promise.resolve({success: false}))

    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    expect(result.current.isFavorited).toBe(false)

    await act(async () => {
      await result.current.favorite()
    })

    expect(resolveFavoritesState).not.toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(false)
  })

  it('should throw error during favorite/unfavorite actions', async () => {
    const errorMessage = 'Failed to update favorite status'

    vi.mocked(node.fetch).mockImplementationOnce(() => {
      throw new Error(errorMessage)
    })

    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    await act(async () => {
      await expect(result.current.favorite()).rejects.toThrow(errorMessage)
    })

    expect(resolveFavoritesState).not.toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(false)
  })

  it('should update connection status', () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    expect(result.current.isConnected).toBe(false)

    act(() => {
      statusCallback?.('connected')
    })

    expect(result.current.isConnected).toBe(true)
  })

  it('should throw error when studio resource is missing projectId or dataset', () => {
    // Mock the Sanity instance to not have projectId or dataset
    vi.mocked(useSanityInstance).mockReturnValue({
      config: {
        projectId: undefined,
        dataset: undefined,
      },
    } as unknown as SanityInstance)

    const mockDocumentHandleWithoutProjectId = {
      documentId: 'mock-id',
      documentType: 'mock-type',
      resourceType: 'studio' as const,
    }

    expect(() => renderHook(() => useManageFavorite(mockDocumentHandleWithoutProjectId))).toThrow(
      'projectId and dataset are required for studio resources',
    )
  })

  it('should throw error when resourceId is missing for non-studio resources', () => {
    const mockMediaDocumentHandle = {
      documentId: 'mock-id',
      documentType: 'mock-type',
      resourceType: 'media-library' as const,
      resourceId: undefined,
    }

    expect(() => renderHook(() => useManageFavorite(mockMediaDocumentHandle))).toThrow(
      'resourceId is required for media-library and canvas resources',
    )
  })
})
