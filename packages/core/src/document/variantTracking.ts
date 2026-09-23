import {type MutationEvent, type SanityDocument} from '@sanity/client'
import {DocumentId, getPublishedId, isVersionId} from '@sanity/id-utils'
import {
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  groupBy,
  map,
  merge,
  mergeMap,
  type Observable,
  of,
  pairwise,
  startWith,
  Subscription,
  switchMap,
} from 'rxjs'

import {type DocumentHandle} from '../config/sanityConfig'
import {type BoundResourceKey} from '../store/createActionBinder'
import {type StoreContext} from '../store/defineStore'
import {omitProperty} from '../utils/object'
import {
  getDocumentKey,
  getDocumentKeyFromSystem,
  getGroupIdFromStoreKey,
  isUnknownDocumentId,
  type UnknownDocumentId,
} from './documentKey'
import {type DocumentStoreState} from './documentStore'
import {
  addSubscriptionIdToDocument,
  removeSubscriptionIdFromDocument,
} from './documentSubscriptions'

/**
 * The slice of store state the variant reducers operate on. Widened from
 * `SyncTransactionState` rather than folded into it so the many test fixtures
 * built against that type keep compiling.
 */
export type VariantTrackingState = Pick<
  DocumentStoreState,
  | 'queued'
  | 'applied'
  | 'documentStates'
  | 'outgoing'
  | 'grants'
  | 'identity'
  | 'variantIndex'
  | 'variantSubscriptions'
>

type VariantHandleLike = Pick<DocumentHandle, 'documentId' | 'perspective' | 'variant' | 'liveEdit'>

/**
 * The variant keys a handle's document may resolve through, most specific
 * first. Follows Content Lake's precedence: the variant over the handle's
 * bundle, then the variant over the published bundle. Empty for non-variant
 * or liveEdit handles.
 */
export function getVariantCandidateKeys(handle: VariantHandleLike): string[] {
  if (!handle.variant || handle.liveEdit) return []
  const overBundle = getDocumentKey(handle)
  const overPublished = getDocumentKey({
    documentId: handle.documentId,
    variant: handle.variant,
    liveEdit: true,
  })
  return [overBundle, overPublished]
}

/**
 * Where a variant key currently points. `undefined` means the key has not
 * been resolved yet and callers should treat the document as loading.
 */
export function resolveVariantKey(
  state: Pick<VariantTrackingState, 'variantIndex'>,
  key: string,
): DocumentId | UnknownDocumentId | null | undefined {
  return state.variantIndex[key]
}

export function addVariantSubscription<State extends VariantTrackingState>(
  prev: State,
  key: string,
  subscriptionId: string,
): State {
  const next = {
    ...prev,
    variantSubscriptions: {
      ...prev.variantSubscriptions,
      [key]: [...(prev.variantSubscriptions[key] ?? []), subscriptionId],
    },
  }
  // when the key is already resolved, the subscriber also holds the concrete
  // document so it is fetched and listened to like any other
  const resolved = prev.variantIndex[key]
  return resolved ? addSubscriptionIdToDocument(next, resolved, subscriptionId) : next
}

/**
 * Releases a subscriber's interest in a variant key, and in the document the
 * key resolves to. Once the key has no subscribers left its index entry is
 * dropped too: nothing watches the group any more, so the entry would go stale,
 * and a later subscriber rediscovers the key from scratch.
 */
export function removeVariantSubscription<State extends VariantTrackingState>(
  prev: State,
  key: string,
  subscriptionId: string,
): State {
  const remaining = (prev.variantSubscriptions[key] ?? []).filter((id) => id !== subscriptionId)
  const next = {
    ...prev,
    variantSubscriptions: remaining.length
      ? {...prev.variantSubscriptions, [key]: remaining}
      : omitProperty(prev.variantSubscriptions, key),
  }
  const resolved = prev.variantIndex[key]
  const released = resolved
    ? removeSubscriptionIdFromDocument(next, resolved, subscriptionId)
    : next
  if (remaining.length || !(key in released.variantIndex)) return released
  return {...released, variantIndex: omitProperty(released.variantIndex, key)}
}

/**
 * Records that a variant key resolves to a concrete document, attaching every
 * subscriber waiting on the key to that document so the ordinary per-id
 * fetch-and-listen flow picks it up. Exported for tests.
 *
 * @internal
 */
export function resolveVariantToDocument<State extends VariantTrackingState>(
  prev: State,
  key: string,
  documentId: DocumentId,
): State {
  if (prev.variantIndex[key] === documentId) return prev
  return retargetVariantKey(prev, key, documentId)
}

/**
 * Records that the remote holds no document for a variant key. Selectors fall
 * through to the next candidate rather than waiting. Exported for tests.
 *
 * @internal
 */
export function markVariantAbsent<State extends VariantTrackingState>(
  prev: State,
  key: string,
): State {
  if (prev.variantIndex[key] === null) return prev
  return retargetVariantKey(prev, key, null)
}

/**
 * Points a variant key at a new target and moves the key's subscribers with
 * it. They are detached from the concrete document the key pointed at before
 * (which is evicted once nothing else holds it), so a variant that disappears
 * or is replaced doesn't keep its old document fetched and listened to.
 */
function retargetVariantKey<State extends VariantTrackingState>(
  prev: State,
  key: string,
  target: DocumentId | null,
): State {
  const previous = prev.variantIndex[key]
  const subscriptionIds = prev.variantSubscriptions[key] ?? []
  const detached =
    previous && !isUnknownDocumentId(previous)
      ? subscriptionIds.reduce(
          (acc, subscriptionId) => removeSubscriptionIdFromDocument(acc, previous, subscriptionId),
          prev,
        )
      : prev
  const withIndex = {...detached, variantIndex: {...detached.variantIndex, [key]: target}}
  if (!target) return withIndex
  return subscriptionIds.reduce(
    (acc, subscriptionId) => addSubscriptionIdToDocument(acc, target, subscriptionId),
    withIndex,
  )
}

/**
 * Watches the set of variant keys with subscribers and discovers the documents
 * behind them. Variant ids can't be derived from a handle, so this fetches
 * each document group in full (on first interest and whenever the shared
 * listener reconnects) and matches the returned documents to keys by their
 * `_system` identity. Thereafter it watches the shared listener for variant
 * documents appearing or disappearing in a watched group.
 */
export const subscribeToVariantSubscriptionsAndDiscover = ({
  state,
}: StoreContext<DocumentStoreState, BoundResourceKey>): Subscription => {
  const {sharedListener, fetchDocumentGroup, fetchDocument} = state.get()

  const watchedGroups$ = state.observable.pipe(
    filter((storeState) => !!storeState.grants),
    map(
      (storeState) =>
        new Set(Object.keys(storeState.variantSubscriptions).map(getGroupIdFromStoreKey)),
    ),
    distinctUntilChanged(
      (previous, current) =>
        previous.size === current.size && [...previous].every((groupId) => current.has(groupId)),
    ),
  )

  // the shared listener disconnects once nothing observes it, so the discovery
  // streams only observe it while at least one variant key is watched
  const listenerWhileWatching$ = state.observable.pipe(
    map((storeState) => Object.keys(storeState.variantSubscriptions).length > 0),
    distinctUntilChanged(),
    switchMap((watching) => (watching ? sharedListener.events : EMPTY)),
  )

  const resolveDiscovered = (prev: DocumentStoreState, documents: SanityDocument[]) => {
    let next = prev
    const found = new Set<string>()
    for (const document of documents) {
      const key = getDocumentKeyFromSystem(document)
      if (!key || !(key in prev.variantSubscriptions)) continue
      found.add(key)
      next = resolveVariantToDocument(next, key, DocumentId(document._id))
    }
    return {next, found}
  }

  // a fresh connection (or one that could not resume) may have missed variants
  // appearing or disappearing, so every watched group is refetched
  const resync$ = listenerWhileWatching$.pipe(
    filter((event) => event.type === 'welcome' || event.type === 'reset'),
  )

  const groupFetches = watchedGroups$.pipe(
    startWith(new Set<string>()),
    pairwise(),
    switchMap(([previous, current]) =>
      from([...current].filter((groupId) => !previous.has(groupId))),
    ),
    groupBy((groupId) => groupId),
    mergeMap((group$) =>
      group$.pipe(
        switchMap((groupId) =>
          merge(of(undefined), resync$).pipe(
            switchMap(() => fetchDocumentGroup(groupId)),
            map((response) => ({groupId, documents: response.documents})),
          ),
        ),
      ),
    ),
  )

  // variant documents appearing in a watched group that the index doesn't know
  // yet. their `_system` is on the create mutation when the listener includes
  // mutations; otherwise the document is fetched to read it
  const appearances = listenerWhileWatching$.pipe(
    filter((event): event is MutationEvent => event.type === 'mutation'),
    filter((event) => event.transition === 'appear' && isVersionId(DocumentId(event.documentId))),
    mergeMap((event) => {
      const groupId = getPublishedId(DocumentId(event.documentId))
      const {variantSubscriptions} = state.get()
      const watched = Object.keys(variantSubscriptions).some(
        (key) => getGroupIdFromStoreKey(key) === groupId,
      )
      if (!watched) return EMPTY
      const created = findCreatedDocument(event)
      const document$: Observable<SanityDocument | null> = created
        ? of(created)
        : (fetchDocument(event.documentId) as Observable<SanityDocument | null>)
      return document$.pipe(
        filter((document): document is SanityDocument => document !== null),
        map((document) => ({groupId, documents: [document]})),
      )
    }),
  )

  const disappearances = listenerWhileWatching$.pipe(
    filter((event): event is MutationEvent => event.type === 'mutation'),
    filter((event) => event.transition === 'disappear'),
  )

  const subscription = new Subscription()

  // a full group fetch is authoritative: any watched key in the group that it
  // did not return is marked absent, unless it is a locally pending variant
  // that the remote has not been told about yet
  subscription.add(
    groupFetches.subscribe(({groupId, documents}) => {
      state.set('discoverVariantGroup', (prev) => {
        const {next, found} = resolveDiscovered(prev, documents)
        return Object.keys(prev.variantSubscriptions).reduce((acc, key) => {
          if (getGroupIdFromStoreKey(key) !== groupId || found.has(key)) return acc
          if (isUnknownDocumentId(prev.variantIndex[key] ?? '')) return acc
          return markVariantAbsent(acc, key)
        }, next)
      })
    }),
  )

  // an appearance says nothing about the group's other variants
  subscription.add(
    appearances.subscribe(({documents}) => {
      state.set('discoverVariantAppearance', (prev) => resolveDiscovered(prev, documents).next)
    }),
  )

  subscription.add(
    disappearances.subscribe((event) => {
      state.set('markVariantDisappeared', (prev) => {
        const entry = Object.entries(prev.variantIndex).find(([, id]) => id === event.documentId)
        return entry ? markVariantAbsent(prev, entry[0]) : prev
      })
    }),
  )

  return subscription
}

function findCreatedDocument(event: MutationEvent): SanityDocument | undefined {
  for (const mutation of event.mutations) {
    const created =
      'create' in mutation
        ? mutation.create
        : 'createOrReplace' in mutation
          ? mutation.createOrReplace
          : 'createIfNotExists' in mutation
            ? mutation.createIfNotExists
            : undefined
    if (created && created['_id'] === event.documentId) return created as SanityDocument
  }
  return undefined
}
