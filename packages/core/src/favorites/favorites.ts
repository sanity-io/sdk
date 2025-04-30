import {
  type CanvasResource,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {catchError, from, map, Observable, of, shareReplay, throwError, timeout} from 'rxjs'

import {getOrCreateNode, releaseNode} from '../comlink/node/comlinkNodeStore'
import {type DocumentHandle} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {createFetcherStore} from '../utils/createFetcherStore'

// Users may, in many situations, be developing
// without a connection to the Dashboard UI.
// This timeout allows us to return a fallback state
// instead of suspending.
const FAVORITES_FETCH_TIMEOUT = 3000

/**
 * @public
 */
export interface FavoriteStatusResponse {
  isFavorited: boolean
}

/**
 * @public
 */
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

const favorites = createFetcherStore<[FavoriteDocumentContext], FavoriteStatusResponse>({
  name: 'Favorites',
  getKey: (_instance: SanityInstance, context: FavoriteDocumentContext) => {
    return createFavoriteKey(context)
  },
  fetcher: (instance: SanityInstance) => {
    return (context: FavoriteDocumentContext): Observable<FavoriteStatusResponse> => {
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

      const dashboardFetch = from(
        node.fetch(
          // @ts-expect-error -- getOrCreateNode should be refactored to take type arguments
          'dashboard/v1/events/favorite/query',
          payload,
        ) as Promise<FavoriteStatusResponse>,
      ).pipe(
        timeout({
          first: FAVORITES_FETCH_TIMEOUT,
          with: () => throwError(() => new Error('Favorites service connection timeout')),
        }),
        map((response) => {
          return {isFavorited: response.isFavorited}
        }),
        catchError((err) => {
          // eslint-disable-next-line no-console
          console.error('Favorites service connection error', err)
          return of({isFavorited: false})
        }),
        // Share the same subscription between multiple subscribers
        shareReplay(1),
      )

      // Clean up when all subscribers are gone
      return new Observable<FavoriteStatusResponse>((subscriber) => {
        const subscription = dashboardFetch.subscribe(subscriber)
        return () => {
          subscription.unsubscribe()
          // If this was the last subscriber, clean up
          if (subscription.closed) {
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
