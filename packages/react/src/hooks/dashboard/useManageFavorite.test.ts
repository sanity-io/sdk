import {type Message} from '@sanity/comlink'
import {
  type FavoriteStatusResponse,
  getFavoritesState,
  resolveFavoritesState,
  type SanityInstance,
} from '@sanity/sdk'
import {BehaviorSubject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {act, renderHook} from '../../../test/test-utils'
import {useWindowConnection, type WindowConnection} from '../comlink/useWindowConnection'
import {useSanityInstance} from '../context/useSanityInstance'
import {useManageFavorite} from './useManageFavorite'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getFavoritesState: vi.fn(),
    resolveFavoritesState: vi.fn(),
  }
})

vi.mock('../context/useSanityInstance')

vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

describe('useManageFavorite', () => {
  let favoriteStatusSubject: BehaviorSubject<FavoriteStatusResponse>
  let mockFetch: ReturnType<typeof vi.fn>
  let mockSendMessage: ReturnType<typeof vi.fn>

  const mockDocumentHandle = {
    documentId: 'mock-id',
    documentType: 'mock-type',
    resourceType: 'studio' as const,
  }

  beforeEach(() => {
    favoriteStatusSubject = new BehaviorSubject<FavoriteStatusResponse>({isFavorited: false})

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

    // Mock useWindowConnection
    mockFetch = vi.fn().mockResolvedValue({success: true})
    mockSendMessage = vi.fn()
    vi.mocked(useWindowConnection).mockImplementation(() => {
      return {
        fetch: (type: string, data?: unknown, options: unknown = {}) =>
          mockFetch(type, data, options),
        sendMessage: mockSendMessage,
      }
    })
  })

  afterEach(() => {
    favoriteStatusSubject.complete()
    vi.clearAllMocks()
  })

  it('should initialize with default states', () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    expect(result.current.isFavorited).toBe(false)
  })

  it('should handle favorite action and update state', async () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    expect(result.current.isFavorited).toBe(false)

    await act(async () => {
      await result.current.favorite()
    })

    expect(mockFetch).toHaveBeenCalledWith(
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

    expect(mockFetch).toHaveBeenCalledWith(
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
    mockFetch.mockResolvedValueOnce({success: false})

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

    mockFetch.mockImplementation(() => {
      throw new Error(errorMessage)
    })

    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))

    await act(async () => {
      await expect(result.current.favorite()).rejects.toThrow(errorMessage)
    })

    expect(resolveFavoritesState).not.toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(false)

    await act(async () => {
      await expect(result.current.unfavorite()).rejects.toThrow(errorMessage)
    })

    expect(resolveFavoritesState).not.toHaveBeenCalled()
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

  it('should include schemaName in payload when provided', async () => {
    const mockDocumentHandleWithSchema = {
      ...mockDocumentHandle,
      schemaName: 'testSchema',
    }
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandleWithSchema))

    await act(async () => {
      await result.current.favorite()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'dashboard/v1/events/favorite/mutate',
      {
        document: {
          id: 'mock-id',
          type: 'mock-type',
          resource: {
            id: 'test.test',
            type: 'studio',
            schemaName: 'testSchema',
          },
        },
        eventType: 'added',
      },
      {},
    )
  })

  it('should default isFavorited to false if state is undefined', () => {
    // Mock getFavoritesState to return undefined for getCurrent
    vi.mocked(getFavoritesState).mockImplementation(() => ({
      subscribe: (callback?: () => void) => {
        if (!callback) return () => {}
        callback()
        return () => {}
      },
      getCurrent: () => undefined,
      observable: favoriteStatusSubject.asObservable(),
    }))
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))
    expect(result.current.isFavorited).toBe(false)
  })

  it('should do nothing if fetch is missing', async () => {
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: undefined,
      sendMessage: mockSendMessage,
    } as unknown as WindowConnection<Message>)
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle))
    await act(async () => {
      await result.current.favorite()
      await result.current.unfavorite()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should do nothing if documentId is missing', async () => {
    const handle = {...mockDocumentHandle, documentId: undefined}
    // @ts-expect-error -- no access to ManageFavorite props type
    const {result} = renderHook(() => useManageFavorite(handle))
    await act(async () => {
      await result.current.favorite()
      await result.current.unfavorite()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should do nothing if documentType is missing', async () => {
    const handle = {...mockDocumentHandle, documentType: undefined}
    // @ts-expect-error -- no access to ManageFavorite props type
    const {result} = renderHook(() => useManageFavorite(handle))
    await act(async () => {
      await result.current.favorite()
      await result.current.unfavorite()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should do nothing if resourceType is missing', async () => {
    const handle = {...mockDocumentHandle, resourceType: undefined, resourceId: 'studio'}
    // @ts-expect-error -- no access to ManageFavorite props type
    const {result} = renderHook(() => useManageFavorite(handle))
    await act(async () => {
      await result.current.favorite()
      await result.current.unfavorite()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
