import {type Message} from '@sanity/comlink'
import {favorites, type FavoriteStatusResponse, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {act, renderHook} from '@testing-library/react'
import {BehaviorSubject} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useWindowConnection, type WindowConnection} from '../comlink/useWindowConnection'
import {useManageFavorite} from './useManageFavorite'

type MockFetch = (type: string, data?: unknown, options?: unknown) => Promise<{success: boolean}>
type MockSendMessage = (type: string, data?: unknown) => void

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    favorites: {
      getState: vi.fn(),
      resolveState: vi.fn(),
      refetch: vi.fn(),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      setData: vi.fn(),
    },
  }
})

vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

describe('useManageFavorite', () => {
  let favoriteStatusSubject: BehaviorSubject<FavoriteStatusResponse>
  let mockFetch: Mock<MockFetch>
  let mockSendMessage: Mock<MockSendMessage>

  const mockDocumentHandle = {
    documentId: 'mock-id',
    documentType: 'mock-type',
    resourceType: 'studio' as const,
  }

  // Fresh objects per call are fine: the fetcher hook deep-compares snapshots
  // before handing them to useSyncExternalStore.
  const toSnapshot = (value: FavoriteStatusResponse): FetcherSnapshot<FavoriteStatusResponse> => ({
    status: 'success',
    data: value,
    error: undefined,
    isFetching: false,
    dataUpdatedAt: 1,
  })

  beforeEach(() => {
    favoriteStatusSubject = new BehaviorSubject<FavoriteStatusResponse>({isFavorited: false})

    // Mock favorites.getState
    vi.mocked(favorites.getState).mockImplementation(
      () =>
        ({
          subscribe: (callback?: () => void) => {
            if (!callback) return () => {}

            const subscription = favoriteStatusSubject.subscribe(() => callback())
            callback() // Initial call
            return () => subscription.unsubscribe()
          },
          getCurrent: () => toSnapshot(favoriteStatusSubject.getValue()),
          observable: favoriteStatusSubject.asObservable(),
        }) as unknown as StateSource<FetcherSnapshot<FavoriteStatusResponse>>,
    )

    // Mock favorites.refetch
    vi.mocked(favorites.refetch).mockImplementation(async () => {
      const newValue = {isFavorited: !favoriteStatusSubject.getValue().isFavorited}
      favoriteStatusSubject.next(newValue)
      return newValue
    })

    // Mock useWindowConnection
    mockFetch = vi.fn<MockFetch>().mockResolvedValue({success: true})
    mockSendMessage = vi.fn<MockSendMessage>()
    vi.mocked(useWindowConnection).mockImplementation(
      () =>
        ({
          fetch: (type: string, data?: unknown, options: unknown = {}) =>
            mockFetch(type, data, options),
          sendMessage: mockSendMessage,
        }) as unknown as WindowConnection<Message>,
    )
  })

  afterEach(() => {
    favoriteStatusSubject.complete()
    vi.clearAllMocks()
  })

  it('should initialize with default states', () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    expect(result.current.isFavorited).toBe(false)
  })

  it('should handle favorite action and update state', async () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test" dataset="test" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

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
    expect(favorites.refetch).toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(true)
  })

  it('should handle unfavorite action and update state', async () => {
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test" dataset="test" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

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
    expect(favorites.refetch).toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(false)
  })

  it('should not update state if favorite action fails', async () => {
    mockFetch.mockResolvedValueOnce({success: false})

    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    expect(result.current.isFavorited).toBe(false)

    await act(async () => {
      await result.current.favorite()
    })

    expect(favorites.refetch).not.toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(false)
  })

  it('should throw error during favorite/unfavorite actions', async () => {
    const errorMessage = 'Failed to update favorite status'
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFetch.mockImplementation(() => {
      throw new Error(errorMessage)
    })

    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    await act(async () => {
      await expect(result.current.favorite()).rejects.toThrow(errorMessage)
    })

    expect(favorites.refetch).not.toHaveBeenCalled()
    expect(result.current.isFavorited).toBe(false)

    await act(async () => {
      await expect(result.current.unfavorite()).rejects.toThrow(errorMessage)
    })

    expect(favorites.refetch).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should throw error when studio resource is missing projectId or dataset', () => {
    const mockDocumentHandleWithoutProjectId = {
      documentId: 'mock-id',
      documentType: 'mock-type',
      resourceType: 'studio' as const,
    }

    expect(() =>
      renderHook(() => useManageFavorite(mockDocumentHandleWithoutProjectId), {
        wrapper: ({children}) => (
          <ResourceProvider projectId={undefined} dataset={undefined} fallback={null}>
            {children}
          </ResourceProvider>
        ),
      }),
    ).toThrow('projectId and dataset are required for studio resources')
  })

  it('should throw error when resourceId is missing for non-studio resources', () => {
    const mockMediaDocumentHandle = {
      documentId: 'mock-id',
      documentType: 'mock-type',
      resourceType: 'media-library' as const,
      resourceId: undefined,
    }

    expect(() =>
      renderHook(() => useManageFavorite(mockMediaDocumentHandle), {
        wrapper: ({children}) => (
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            {children}
          </ResourceProvider>
        ),
      }),
    ).toThrow('resourceId is required for media-library and canvas resources')
  })

  it('should include schemaName in payload when provided', async () => {
    const mockDocumentHandleWithSchema = {
      ...mockDocumentHandle,
      schemaName: 'testSchema',
    }
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandleWithSchema), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

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
            id: 'test-project.test-dataset',
            type: 'studio',
            schemaName: 'testSchema',
          },
        },
        eventType: 'added',
      },
      {},
    )
  })

  it('should suspend until the favorite status is available', () => {
    const pending: FetcherSnapshot<FavoriteStatusResponse> = {
      status: 'pending',
      data: undefined,
      error: undefined,
      isFetching: true,
      dataUpdatedAt: undefined,
    }
    vi.mocked(favorites.getState).mockImplementation(
      () =>
        ({
          subscribe: () => () => {},
          getCurrent: () => pending,
          observable: favoriteStatusSubject.asObservable(),
        }) as unknown as StateSource<FetcherSnapshot<FavoriteStatusResponse>>,
    )
    vi.mocked(favorites.resolveState).mockReturnValue(new Promise(() => {}))
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    // Suspended on the initial fetch — the ResourceProvider fallback renders instead.
    expect(result.current).toBeNull()
    expect(favorites.resolveState).toHaveBeenCalled()
  })

  it('should do nothing if fetch is missing', async () => {
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: undefined,
      sendMessage: mockSendMessage,
    } as unknown as WindowConnection<Message>)
    const {result} = renderHook(() => useManageFavorite(mockDocumentHandle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    await act(async () => {
      await result.current.favorite()
      await result.current.unfavorite()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should do nothing if documentId is missing', async () => {
    const handle = {...mockDocumentHandle, documentId: undefined}
    // @ts-expect-error -- no access to ManageFavorite props type
    const {result} = renderHook(() => useManageFavorite(handle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    await act(async () => {
      await result.current.favorite()
      await result.current.unfavorite()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should do nothing if documentType is missing', async () => {
    const handle = {...mockDocumentHandle, documentType: undefined}
    // @ts-expect-error -- no access to ManageFavorite props type
    const {result} = renderHook(() => useManageFavorite(handle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    await act(async () => {
      await result.current.favorite()
      await result.current.unfavorite()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should do nothing if resourceType is missing', async () => {
    const handle = {...mockDocumentHandle, resourceType: undefined, resourceId: 'studio'}
    // @ts-expect-error -- no access to ManageFavorite props type
    const {result} = renderHook(() => useManageFavorite(handle), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    await act(async () => {
      await result.current.favorite()
      await result.current.unfavorite()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
