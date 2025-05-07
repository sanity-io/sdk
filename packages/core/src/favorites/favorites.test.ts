import {type Node} from '@sanity/comlink'
import {firstValueFrom, of, Subject} from 'rxjs'
import {describe, expect, it, type Mock, vi} from 'vitest'

import {getNodeState, type NodeState} from '../comlink/node/getNodeState'
import {type FrameMessage, type WindowMessage} from '../comlink/types'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getFavoritesState, resolveFavoritesState} from './favorites'

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
      await resolveFavoritesState(instance!, mockContext)
      await resolveFavoritesState(instance!, {
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
      await resolveFavoritesState(instance!, mockContextNoSchema)
      await resolveFavoritesState(instance!, {
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
      const result = await resolveFavoritesState(instance!, mockContext)
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
      setupMockStateSource({fetchImpl: vi.fn().mockRejectedValue(new Error('Failed to fetch'))})
      const result = await resolveFavoritesState(instance!, mockContext)
      expect(result).toEqual({isFavorited: false})
    })

    it('shares observable between multiple subscribers and cleans up', async () => {
      const mockResponse = {isFavorited: true}
      setupMockStateSource({fetchImpl: vi.fn().mockResolvedValue(mockResponse)})
      const state = getFavoritesState(instance!, mockContext)
      // First subscriber
      const sub1 = state.subscribe()
      await firstValueFrom(state.observable)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      // Second subscriber should use cached response
      const sub2 = state.subscribe()
      await firstValueFrom(state.observable)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      // Cleanup
      sub1()
      sub2()
    })

    it('reuses active fetch via createFetcherStore/shareReplay when called again while pending', async () => {
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
      const promise1 = resolveFavoritesState(instance!, mockContext)
      // Simulate node becoming connected
      subject.next({node: mockNode, status: 'connected'})
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      // Call 2: Should reuse the pending fetch via createFetcherStore/shareReplay
      const promise2 = resolveFavoritesState(instance!, mockContext)
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
})
