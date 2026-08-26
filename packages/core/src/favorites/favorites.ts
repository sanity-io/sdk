import {
  type CanvasResource,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {catchError, filter, from, map, Observable, of, shareReplay, switchMap} from 'rxjs'

import {getNodeState} from '../comlink/node/getNodeState'
import {type DocumentHandle} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {createFetcherStore} from '../utils/createFetcherStore'

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
      const nodeStateSource = getNodeState(instance, {
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

      return nodeStateSource.observable.pipe(
        filter((nodeState) => !!nodeState), // Only proceed when connected
        shareReplay(1),
        switchMap((nodeState) => {
          const node = nodeState!.node
          return from(
            node.fetch(
              // @ts-expect-error -- getOrCreateNode should be refactored to take type arguments
              'dashboard/v1/events/favorite/query',
              payload,
            ) as Promise<FavoriteStatusResponse>,
          ).pipe(
            map((response) => ({isFavorited: response.isFavorited})),
            catchError((err) => {
              // eslint-disable-next-line no-console
              console.error('Favorites service connection error', err)
              return of({isFavorited: false})
            }),
          )
        }),
      )
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
