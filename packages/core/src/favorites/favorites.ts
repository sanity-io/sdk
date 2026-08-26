import {
  type CanvasResource,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {catchError, first, from, map, type Observable, of, switchMap} from 'rxjs'

import {getNodeState} from '../comlink/node/getNodeState'
import {type DocumentHandle} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher} from '../store/fetcherStore'

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

/**
 * Fetcher for a document's favorite status, read from the dashboard over
 * comlink, on the shared fetcher cache.
 *
 * @internal
 */
export const favorites = defineFetcher<[context: FavoriteDocumentContext], FavoriteStatusResponse>({
  name: 'favorites',
  getKey: (_instance: SanityInstance, context: FavoriteDocumentContext) =>
    createFavoriteKey(context),
  fetch: (instance) => {
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
        // Wait until connected, then complete after the single fetch settles.
        first((nodeState) => !!nodeState),
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
