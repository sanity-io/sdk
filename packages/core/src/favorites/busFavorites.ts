import {FETCH_TIMEOUT_DEFAULT} from '@sanity/comlink'
import {DocumentId, isPublishedIdEqual} from '@sanity/id-utils'
import {catchError, defer, distinctUntilChanged, EMPTY, map, merge, type Observable} from 'rxjs'

import {requireDashboardMessageBus} from '../dashboard/messageBus/store'
import {type CapabilityRecord, type FavoriteDocument} from '../dashboard/messageBus/topics'
import {getTopicState, resolveTopic} from '../dashboard/messageBus/topicStore'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {defineMutation} from '../store/fetcherStore'
import {
  type FavoriteDocumentContext,
  type FavoriteStatusResponse,
  type SetFavoriteInput,
  toFavoriteDocument,
} from './favorites'

function toBusFavoriteDocument(context: FavoriteDocumentContext): FavoriteDocument {
  const document = toFavoriteDocument(context)
  const type = context.resourceType === 'studio' ? 'dataset' : context.resourceType
  return {...document, resource: {...document.resource, type}}
}

// Published IDs mirror Dashboard's `_stableId` match.
const isSameFavorite = (a: FavoriteDocument, b: FavoriteDocument): boolean =>
  a.type === b.type &&
  a.resource.id === b.resource.id &&
  a.resource.type === b.resource.type &&
  a.resource.schemaName === b.resource.schemaName &&
  isPublishedIdEqual(DocumentId(a.id), DocumentId(b.id))

/**
 * A state source for whether a document is favorited, matched against the `favorites.documents`
 * the dashboard message bus host publishes. The message bus counterpart to the Comlink
 * {@link favorites} fetcher.
 *
 * @remarks
 * Returns `undefined` until the host publishes `applications.capabilities` and, while it provides
 * `favorites`, `favorites.documents`; use {@link resolveBusFavorite} to wait for them. Returns
 * `false` when the host does not provide `favorites` or the `favorites.documents` read fails.
 * A favorite is identified by its published document ID, type, resource and `schemaName`
 * (workspace), like in Dashboard.
 * @internal
 */
export function getBusFavoriteState(
  instance: SanityInstance,
  context: FavoriteDocumentContext,
): StateSource<boolean | undefined> {
  const capabilities = getTopicState(instance, 'applications.capabilities')
  const documents = getTopicState(instance, 'favorites.documents')
  const target = toBusFavoriteDocument(context)

  const getCurrent = (): boolean | undefined => {
    const provided = capabilities.getCurrent() as CapabilityRecord | undefined
    if (provided === undefined) return undefined
    if (provided.favorites !== true) return false
    // A failed read degrades to "not favorited", like the Comlink fetcher.
    try {
      const favorites = documents.getCurrent() as FavoriteDocument[] | undefined
      return favorites?.some((favorite) => isSameFavorite(favorite, target))
    } catch {
      return false
    }
  }

  const subscribe = (onStoreChanged?: () => void) => {
    const unsubscribes = [
      capabilities.subscribe(onStoreChanged),
      documents.subscribe(onStoreChanged),
    ]
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }

  const observable: Observable<boolean | undefined> = merge(
    capabilities.observable,
    documents.observable.pipe(catchError(() => EMPTY)),
  ).pipe(map(getCurrent), distinctUntilChanged())

  return {getCurrent, subscribe, observable}
}

/**
 * Resolves once {@link getBusFavoriteState} has the next value it waits for: the host's
 * capabilities first, then its `favorites.documents`.
 *
 * @internal
 */
export function resolveBusFavorite(instance: SanityInstance): Promise<void> {
  const capabilities = getTopicState(instance, 'applications.capabilities').getCurrent()
  return resolveTopic(
    instance,
    capabilities === undefined ? 'applications.capabilities' : 'favorites.documents',
  )
}

/**
 * Sets a document's favorite state over the dashboard message bus. The message bus counterpart
 * to `setFavorite`; the host keeps `favorites.documents` current, so there is no cache to
 * invalidate.
 *
 * @internal
 */
export const setBusFavorite = defineMutation<SetFavoriteInput, FavoriteStatusResponse>({
  name: 'setBusFavorite',
  mutationFn:
    (instance) =>
    ({isFavorited, ...context}) =>
      defer(() =>
        requireDashboardMessageBus(instance, 'update a favorite').emit(
          'favorites.update',
          {document: toBusFavoriteDocument(context), favorited: isFavorited},
          // Matches the reply timeout of the Comlink write.
          {timeout: FETCH_TIMEOUT_DEFAULT},
        ),
      ).pipe(map(() => ({isFavorited}))),
})
