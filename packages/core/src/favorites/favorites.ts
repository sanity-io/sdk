import {
  type CanvasResource,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {catchError, from, map, Observable, of, shareReplay} from 'rxjs'

import {getOrCreateNode, releaseNode} from '../comlink/node/comlinkNodeStore'
import {type DocumentHandle} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {createFetcherStore} from '../utils/createFetcherStore'

export interface FavoriteStatusResponse {
  isFavorited: boolean
}

interface FavoriteDocumentContext extends DocumentHandle {
  resourceId: string
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
  schemaName?: string
}

// Helper to create a stable key for the store
function createFavoriteKey(context: FavoriteDocumentContext): string {
  return `${context.documentId}:${context.documentType}:${context.resourceId}:${context.resourceType}${
    context.schemaName ? `:${context.schemaName}` : ''
  }`
}

const activeFetches = new Map<string, Observable<FavoriteStatusResponse>>()

const favorites = createFetcherStore<[FavoriteDocumentContext], FavoriteStatusResponse>({
  name: 'Favorites',
  getKey: (_instance: SanityInstance, context: FavoriteDocumentContext) => {
    return createFavoriteKey(context)
  },
  fetcher: (instance: SanityInstance) => {
    return (context: FavoriteDocumentContext): Observable<FavoriteStatusResponse> => {
      const key = createFavoriteKey(context)

      // Check if we already have an active fetch for this key
      const existingFetch = activeFetches.get(key)
      if (existingFetch) {
        return existingFetch
      }

      const node = getOrCreateNode(instance, {
        name: SDK_NODE_NAME,
        connectTo: SDK_CHANNEL_NAME,
      })

      const payload = {
        document: {
          id: context.documentId,
          type: context.documentType,
          resource: {
            id: context.resourceId,
            type: context.resourceType,
            schemaName: context.schemaName,
          },
        },
      }

      // Create a shared observable that will be reused for the same key
      const sharedFetch = from(
        node.fetch(
          // @ts-expect-error -- getOrCreateNode should be refactored to take type arguments
          'dashboard/v1/events/favorite/query',
          payload,
        ) as Promise<FavoriteStatusResponse>,
      ).pipe(
        map((response) => {
          return {isFavorited: response.isFavorited}
        }),
        catchError(() => {
          activeFetches.delete(key)
          return of({isFavorited: false})
        }),
        // Share the same subscription between multiple subscribers
        shareReplay(1),
      )

      // Store the fetch for reuse
      activeFetches.set(key, sharedFetch)

      // Clean up when all subscribers are gone
      return new Observable<FavoriteStatusResponse>((subscriber) => {
        const subscription = sharedFetch.subscribe(subscriber)
        return () => {
          subscription.unsubscribe()
          // If this was the last subscriber, clean up
          if (subscription.closed) {
            activeFetches.delete(key)
            releaseNode(instance, SDK_NODE_NAME)
          }
        }
      })
    }
  },
})

/**
 * Gets a StateSource for the favorite status of a document.
 * @param instance - The Sanity instance.
 * @param context - The document context including ID, type, and resource information.
 * @returns A StateSource emitting `{ isFavorited: boolean }`.
 * @public
 */
export const getFavoritesState = favorites.getState

/**
 * Resolves the favorite status for a document.
 * @param instance - The Sanity instance.
 * @param context - The document context including ID, type, and resource information.
 * @returns A Promise resolving to `{ isFavorited: boolean }`.
 * @public
 */
export const resolveFavoritesState = favorites.resolveState
