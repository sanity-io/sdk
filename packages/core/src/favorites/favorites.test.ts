import {type Node} from '@sanity/comlink'
import {of, Subject} from 'rxjs'
import {describe, expect, it, type Mock, vi} from 'vitest'

import {getNodeState, type NodeState} from '../comlink/node/getNodeState'
import {type FrameMessage, type WindowMessage} from '../comlink/types'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {favorites, setFavorite} from './favorites'

vi.mock('../comlink/node/getNodeState', () => ({
  getNodeState: vi.fn(),
}))

let instance: SanityInstance | undefined
let mockFetch: ReturnType<typeof vi.fn>
let mockNode: Node<WindowMessage, FrameMessage>
let mockStateSource: StateSource<NodeState>

const setupMockStateSource = (options: {fetchImpl?: Mock; observableImpl?: unknown} = {}) => {
  mockFetch = options.fetchImpl || vi.fn().mockResolvedValue({isFavorited: false})
  mockNode = {fetch: mockFetch} as unknown as Node<WindowMessage, FrameMessage>
  const defaultObservable = of({node: mockNode, status: 'connected'})
  mockStateSource = {
    subscribe: vi.fn((cb) => {
      cb?.({node: mockNode, status: 'connected'})
      return () => {}
    }),
    getCurrent: vi.fn(() => ({node: mockNode, status: 'connected'}) as NodeState),
    observable: options.observableImpl || defaultObservable,
  } as unknown as StateSource<NodeState>
  vi.mocked(getNodeState).mockReturnValue(mockStateSource)
}

describe('favoritesStore', () => {
  const mockContext = {
    documentId: 'doc123',
    documentType: 'movie',
    resourceId: 'res456',
    resourceType: 'studio' as const,
    schemaName: 'movieSchema',
  }

  const mockContextNoSchema = {
    documentId: 'doc123',
    documentType: 'movie',
    resourceId: 'res456',
    resourceType: 'studio' as const,
  }

  describe('createFavoriteKey', () => {
    beforeEach(() => {
      vi.resetAllMocks()
      instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      setupMockStateSource()
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('creates different keys for different contexts with schema name', async () => {
      setupMockStateSource()
      // Make two fetches with different document IDs
      await favorites.resolveState(instance!, mockContext)
      await favorites.resolveState(instance!, {
        ...mockContext,
        documentId: 'different',
      })

      // Verify that the fetch was called with different payloads
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const call1 = mockFetch.mock.calls[0][1]
      const call2 = mockFetch.mock.calls[1][1]
      expect(call1.document.id).toBe('doc123')
      expect(call2.document.id).toBe('different')
    })

    it('creates different keys for contexts without schema name', async () => {
      setupMockStateSource()
      // Make two fetches with different document IDs
      await favorites.resolveState(instance!, mockContextNoSchema)
      await favorites.resolveState(instance!, {
        ...mockContextNoSchema,
        documentId: 'different',
      })

      // Verify that the fetch was called with different payloads
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const call1 = mockFetch.mock.calls[0][1]
      const call2 = mockFetch.mock.calls[1][1]
      expect(call1.document.id).toBe('doc123')
      expect(call2.document.id).toBe('different')
      expect(call1.document.resource.schemaName).toBeUndefined()
      expect(call2.document.resource.schemaName).toBeUndefined()
    })
  })

  describe('fetcher', () => {
    beforeEach(() => {
      vi.resetAllMocks()
      instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      setupMockStateSource()
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('fetches favorite status and handles success', async () => {
      const mockResponse = {isFavorited: true}
      setupMockStateSource({fetchImpl: vi.fn().mockResolvedValue(mockResponse)})
      const result = await favorites.resolveState(instance!, mockContext)
      expect(result).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/events/favorite/query', {
        document: {
          id: mockContext.documentId,
          type: mockContext.documentType,
          resource: {
            id: mockContext.resourceId,
            type: mockContext.resourceType,
            schemaName: mockContext.schemaName,
          },
        },
      })
    })

    it('handles error and returns default response', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      setupMockStateSource({fetchImpl: vi.fn().mockRejectedValue(new Error('Failed to fetch'))})
      const result = await favorites.resolveState(instance!, mockContext)
      expect(result).toEqual({isFavorited: false})
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Favorites service connection error',
        expect.any(Error),
      )
      consoleErrorSpy.mockRestore()
    })

    it('serves subsequent reads within staleTime from the cache', async () => {
      const mockResponse = {isFavorited: true}
      setupMockStateSource({fetchImpl: vi.fn().mockResolvedValue(mockResponse)})
      const first = await favorites.resolveState(instance!, mockContext)
      expect(first).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      // Second read is fresh (within staleTime) — no second fetch
      const second = await favorites.resolveState(instance!, mockContext)
      expect(second).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('dedupes against the in-flight fetch when called again while pending', async () => {
      vi.useFakeTimers()
      let resolveFetch: (value: {isFavorited: boolean}) => void
      const fetchPromise = new Promise<{isFavorited: boolean}>((resolve) => {
        resolveFetch = resolve
      })
      const fetchSpy = vi.fn().mockReturnValue(fetchPromise)
      // Use a Subject to simulate the observable emitting after a tick
      const subject = new Subject<{node: Node<WindowMessage, FrameMessage>; status: string}>()
      mockNode = {fetch: fetchSpy} as unknown as Node<WindowMessage, FrameMessage>
      mockStateSource = {
        subscribe: vi.fn((cb) => {
          const sub = subject.subscribe(cb)
          return () => sub.unsubscribe()
        }),
        getCurrent: vi.fn(() => ({node: mockNode, status: 'connected'}) as NodeState),
        observable: subject.asObservable(),
      } as unknown as StateSource<NodeState>
      vi.mocked(getNodeState).mockReturnValue(mockStateSource)
      // Call 1: Triggers the actual fetch
      const promise1 = favorites.resolveState(instance!, mockContext)
      // Let the deferred fetch start and subscribe to the node state
      await vi.advanceTimersByTimeAsync(1)
      // Simulate node becoming connected
      subject.next({node: mockNode, status: 'connected'})
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      // Call 2: Should reuse the pending fetch
      const promise2 = favorites.resolveState(instance!, mockContext)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      // Resolve the underlying fetch
      resolveFetch!({isFavorited: true})
      await vi.advanceTimersByTimeAsync(1)
      // Check results
      const result1 = await promise1
      const result2 = await promise2
      expect(result1).toEqual({isFavorited: true})
      expect(result2).toEqual({isFavorited: true})
      vi.useRealTimers()
    })
  })

  describe('setFavorite', () => {
    beforeEach(() => {
      vi.resetAllMocks()
      instance = createSanityInstance({projectId: 'p', dataset: 'd'})
      setupMockStateSource({fetchImpl: vi.fn().mockResolvedValue({success: true})})
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('sends the added event with schemaName and resolves to the new state', async () => {
      const result = await setFavorite(instance!, {...mockContext, isFavorited: true})
      expect(result.data).toEqual({isFavorited: true})
      expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/events/favorite/mutate', {
        eventType: 'added',
        document: {
          id: mockContext.documentId,
          type: mockContext.documentType,
          resource: {
            id: mockContext.resourceId,
            type: mockContext.resourceType,
            schemaName: mockContext.schemaName,
          },
        },
      })
    })

    it('sends the removed event and omits schemaName when absent', async () => {
      const result = await setFavorite(instance!, {...mockContextNoSchema, isFavorited: false})
      expect(result.data).toEqual({isFavorited: false})
      const payload = mockFetch.mock.calls[0][1]
      expect(payload.eventType).toBe('removed')
      expect(payload.document.resource).not.toHaveProperty('schemaName')
    })

    it('rejects when the server reports failure', async () => {
      setupMockStateSource({fetchImpl: vi.fn().mockResolvedValue({success: false})})
      await expect(setFavorite(instance!, {...mockContext, isFavorited: true})).rejects.toThrow(
        'Failed to update favorite status',
      )
    })
  })
})
