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
import {type MessageBusConnection} from '../dashboard/messageBus/bus'
import {getDashboardMessageBus} from '../dashboard/messageBus/store'
import {type FavoriteDocument} from '../dashboard/messageBus/topics'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher, defineMutation} from '../store/fetcherStore'

/**
 * @public
 */
export interface FavoriteStatusResponse {
  isFavorited: boolean
}

/**
 * @public
 */
export interface FavoriteDocumentContext extends DocumentHandle {
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

// The bus addresses a studio by its dataset resource, like `applications.activity`.
function toFavoriteDocument(context: FavoriteDocumentContext): FavoriteDocument {
  return {
    id: context.documentId,
    type: context.documentType,
    resource: {
      id: context.resourceId,
      type: context.resourceType === 'studio' ? 'dataset' : context.resourceType,
      schemaName: context.schemaName,
    },
  }
}

const isSameFavorite = (a: FavoriteDocument, b: FavoriteDocument): boolean =>
  a.id === b.id &&
  a.resource.id === b.resource.id &&
  a.resource.type === b.resource.type &&
  a.resource.schemaName === b.resource.schemaName

async function queryBusFavorite(
  bus: MessageBusConnection,
  context: FavoriteDocumentContext,
): Promise<FavoriteStatusResponse> {
  // Without the capability no host publishes `favorites.documents`; reading it would time out.
  const capabilities = await bus.query('applications.capabilities')
  if (!capabilities.favorites) return {isFavorited: false}
  const target = toFavoriteDocument(context)
  const documents = await bus.query('favorites.documents')
  return {isFavorited: documents.some((document) => isSameFavorite(document, target))}
}

/**
 * Fetcher for a document's favorite status, read from the dashboard over the
 * message bus or comlink, on the shared fetcher cache.
 *
 * @internal
 */
export const favorites = defineFetcher<[context: FavoriteDocumentContext], FavoriteStatusResponse>({
  name: 'favorites',
  getKey: (_instance: SanityInstance, context: FavoriteDocumentContext) =>
    createFavoriteKey(context),
  // Tag each entry with its key so `setFavorite` can invalidate exactly it.
  tags: (_data, context) => [{type: 'favorite', id: createFavoriteKey(context)}],
  fetch: (instance) => {
    return (context: FavoriteDocumentContext): Observable<FavoriteStatusResponse> => {
      const bus = getDashboardMessageBus(instance)
      if (bus) {
        return from(
          queryBusFavorite(bus, context).catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error('Favorites service connection error', err)
            return {isFavorited: false}
          }),
        )
      }

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

/**
 * Input for {@link setFavorite}: the document context plus the desired state.
 *
 * @public
 */
export type SetFavoriteInput = FavoriteDocumentContext & {
  /** The favorite state to move to: `true` to favorite, `false` to unfavorite. */
  isFavorited: boolean
}

/**
 * Sets a document's favorite state over the message bus or comlink, then invalidates the cached
 * {@link favorites} status for that document so active readers reconverge on
 * server truth. The write-side counterpart to {@link favorites}.
 *
 * @internal
 */
export const setFavorite = defineMutation<SetFavoriteInput, FavoriteStatusResponse>({
  name: 'setFavorite',
  mutationFn: (instance) => {
    return ({isFavorited, ...context}: SetFavoriteInput): Observable<FavoriteStatusResponse> => {
      const bus = getDashboardMessageBus(instance)
      if (bus) {
        return from(
          bus.emit('favorites.update', {
            document: toFavoriteDocument(context),
            favorited: isFavorited,
          }),
        ).pipe(map(() => ({isFavorited})))
      }

      const nodeStateSource = getNodeState(instance, {
        name: SDK_NODE_NAME,
        connectTo: SDK_CHANNEL_NAME,
      })
      const payload = {
        eventType: isFavorited ? 'added' : 'removed',
        document: {
          id: context.documentId,
          type: context.documentType,
          resource: {
            id: context.resourceId,
            type: context.resourceType,
            ...(context.schemaName ? {schemaName: context.schemaName} : {}),
          },
        },
      }

      return nodeStateSource.observable.pipe(
        // Wait until connected, then complete after the single mutation settles.
        first((nodeState) => !!nodeState),
        switchMap((nodeState) => {
          const node = nodeState!.node
          return from(
            node.fetch(
              // @ts-expect-error -- getOrCreateNode should be refactored to take type arguments
              'dashboard/v1/events/favorite/mutate',
              payload,
            ) as Promise<{success: boolean}>,
          ).pipe(
            map((response) => {
              if (!response.success) throw new Error('Failed to update favorite status')
              return {isFavorited}
            }),
          )
        }),
      )
    }
  },
  invalidates: (_result, input) => [{type: 'favorite', id: createFavoriteKey(input)}],
})
