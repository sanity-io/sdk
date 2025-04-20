import {type Node} from '@sanity/comlink'
import {firstValueFrom} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {getOrCreateNode, releaseNode} from '../comlink/node/comlinkNodeStore'
import {type FrameMessage, type WindowMessage} from '../comlink/types'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {getFavoritesState, resolveFavoritesState} from './favorites'

vi.mock('../comlink/node/comlinkNodeStore')

let instance: SanityInstance | undefined

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
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('creates different keys for different contexts with schema name', async () => {
      const mockFetch = vi.fn().mockResolvedValue({isFavorited: false})
      const mockNode = {fetch: mockFetch}
      vi.mocked(getOrCreateNode).mockReturnValue(
        mockNode as unknown as Node<WindowMessage, FrameMessage>,
      )

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
      const mockFetch = vi.fn().mockResolvedValue({isFavorited: false})
      const mockNode = {fetch: mockFetch}
      vi.mocked(getOrCreateNode).mockReturnValue(
        mockNode as unknown as Node<WindowMessage, FrameMessage>,
      )

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
    })

    afterEach(() => {
      instance?.dispose()
    })

    it('fetches favorite status and handles success', async () => {
      const mockResponse = {isFavorited: true}
      const mockFetch = vi.fn().mockResolvedValue(mockResponse)
      const mockNode = {fetch: mockFetch}

      vi.mocked(getOrCreateNode).mockReturnValue(
        mockNode as unknown as Node<WindowMessage, FrameMessage>,
      )

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
      const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
      const mockNode = {fetch: mockFetch}

      vi.mocked(getOrCreateNode).mockReturnValue(
        mockNode as unknown as Node<WindowMessage, FrameMessage>,
      )

      const result = await resolveFavoritesState(instance!, mockContext)

      expect(result).toEqual({isFavorited: false})
    })

    it('shares observable between multiple subscribers and cleans up', async () => {
      const mockResponse = {isFavorited: true}
      const mockFetch = vi.fn().mockResolvedValue(mockResponse)
      const mockNode = {fetch: mockFetch}

      vi.mocked(getOrCreateNode).mockReturnValue(
        mockNode as unknown as Node<WindowMessage, FrameMessage>,
      )

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

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(vi.mocked(releaseNode)).toHaveBeenCalledWith(instance, 'dashboard/nodes/sdk')
    })
  })
})
