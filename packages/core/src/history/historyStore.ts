import {type SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'
import {
  catchError,
  concat,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  first,
  firstValueFrom,
  groupBy,
  map,
  mergeMap,
  NEVER,
  Observable,
  of,
  pairwise,
  race,
  startWith,
  switchMap,
  tap,
} from 'rxjs'

import {getClientAuthState} from '../auth/authStore'
import {getClientState} from '../client/clientStore'
import {retryRead} from '../client/retry'
import {type DocumentResource} from '../config/sanityConfig'
import {type DocumentChangeEvent, observeDocumentChanges} from '../document/documentChangeSource'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../store/createStateSourceAction'
import {type StoreState} from '../store/createStoreState'
import {defineStore, type StoreContext} from '../store/defineStore'
import {randomId} from '../utils/ids'
import {setCleanupTimeout} from '../utils/setCleanupTimeout'
import {
  fetchDocumentsHistoryEvents,
  HISTORY_API_VERSION,
  type RawDocumentHistoryEvent,
} from './historyClient'
import {
  DEFAULT_HISTORY_LIMIT,
  getDocumentVariantType,
  type ResolvedDocumentsHistoryRequest,
  resolveDocumentsHistoryRequest,
} from './historyOptions'
import {
  applyVariantTransforms,
  dedupeHistoryEvents,
  mergeVariantTimelines,
  normalizeHistoryEvent,
  sortHistoryEvents,
} from './normalizeHistoryEvents'
import {
  type DocumentHistoryEvent,
  type DocumentsHistoryOptions,
  type DocumentVariantType,
  type ResolveDocumentsHistoryOptions,
} from './types'

const HISTORY_STATE_CLEAR_DELAY = 5000
const RELOAD_HISTORY_LIMIT = 10

const EMPTY_EVENTS: DocumentHistoryEvent[] = []
const noopSubscribe = () => () => {}

const EMPTY_HISTORY_STATE_SOURCE: StateSource<DocumentHistoryEvent[] | undefined> = {
  subscribe: noopSubscribe,
  getCurrent: () => EMPTY_EVENTS,
  observable: of(EMPTY_EVENTS),
}

const EMPTY_HAS_MORE_STATE_SOURCE: StateSource<boolean> = {
  subscribe: noopSubscribe,
  getCurrent: () => false,
  observable: of(false),
}

const EMPTY_ERROR_STATE_SOURCE: StateSource<unknown> = {
  subscribe: noopSubscribe,
  getCurrent: () => undefined,
  observable: of(undefined),
}

interface VariantTimelineData {
  variantId: string
  variantType: DocumentVariantType
  apiEvents: DocumentHistoryEvent[]
}

interface HistoryEntryContent {
  variants: Record<string, VariantTimelineData>
}

interface HistoryEntryState {
  subscribers: string[]
  variantIds: string[]
  limit: number
  content?: HistoryEntryContent
  nextCursor: string
  error?: unknown
}

interface HistoryStoreState {
  entries: Record<string, HistoryEntryState | undefined>
  inFlightLoadMore: Map<string, {cursor: string; promise: Promise<void>}>
  error?: unknown
}

interface FetchedHistoryBatch {
  variants: Record<string, VariantTimelineData>
  nextCursor: string
}

interface BoundHistoryRequest {
  resource: DocumentResource
  variantIds: string[]
  limit: number
}

interface BoundResolveHistoryRequest extends BoundHistoryRequest {
  signal?: AbortSignal
}

function toHistoryEntryKey(variantIds: readonly string[], limit: number): string {
  return JSON.stringify([variantIds, limit])
}

function parseHistoryEntryKey(entryKey: string): {variantIds: string[]; limit: number} {
  const [variantIds, limit] = JSON.parse(entryKey) as [string[], number]
  return {variantIds, limit}
}

function createEmptyEntry(entryKey: string): HistoryEntryState {
  const {variantIds, limit} = parseHistoryEntryKey(entryKey)
  return {
    subscribers: [],
    variantIds,
    limit,
    nextCursor: '',
  }
}

function normalizeEventsByVariant(
  variantIds: readonly string[],
  eventsByVariant: Record<string, RawDocumentHistoryEvent[]>,
): Record<string, VariantTimelineData> {
  const variants: Record<string, VariantTimelineData> = {}
  for (const variantId of variantIds) {
    const variantType = getDocumentVariantType(variantId)
    const rawEvents = eventsByVariant[variantId] ?? []
    variants[variantId] = {
      variantId,
      variantType,
      apiEvents: rawEvents.map((ev) => normalizeHistoryEvent(ev, variantId)),
    }
  }
  return variants
}

function mergeSingleVariant(
  variantId: string,
  primaryVariant: VariantTimelineData | undefined,
  secondaryVariant: VariantTimelineData | undefined,
): VariantTimelineData {
  const variantType =
    primaryVariant?.variantType ??
    secondaryVariant?.variantType ??
    getDocumentVariantType(variantId)
  const primaryEvents = primaryVariant ? primaryVariant.apiEvents : EMPTY_EVENTS
  const secondaryEvents = secondaryVariant ? secondaryVariant.apiEvents : EMPTY_EVENTS
  return {
    variantId,
    variantType,
    apiEvents: dedupeHistoryEvents(primaryEvents, secondaryEvents),
  }
}

function mergeVariantMaps(
  primary: Record<string, VariantTimelineData>,
  secondary: Record<string, VariantTimelineData>,
  variantIds: readonly string[],
): Record<string, VariantTimelineData> {
  const merged: Record<string, VariantTimelineData> = {}
  for (const variantId of variantIds) {
    merged[variantId] = mergeSingleVariant(variantId, primary[variantId], secondary[variantId])
  }
  return merged
}

function addEntrySubscriber(entryKey: string, subscriptionId: string) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey] ?? createEmptyEntry(entryKey)
    if (existing.subscribers.includes(subscriptionId)) return prev
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {
          ...existing,
          subscribers: [...existing.subscribers, subscriptionId],
        },
      },
    }
  }
}

function removeEntrySubscriber(entryKey: string, subscriptionId: string) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing) return prev
    const nextSubscribers = existing.subscribers.filter((id) => id !== subscriptionId)
    if (nextSubscribers.length === 0) {
      const nextEntries = {...prev.entries}
      delete nextEntries[entryKey]
      return {...prev, entries: nextEntries}
    }
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {...existing, subscribers: nextSubscribers},
      },
    }
  }
}

function setEntryError(entryKey: string, error: unknown) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing || existing.error === error) return prev
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {...existing, error},
      },
    }
  }
}

function applyInitialBatch(entryKey: string, batch: FetchedHistoryBatch) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing) return prev
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {
          ...existing,
          content: {variants: batch.variants},
          nextCursor: batch.nextCursor,
          error: undefined,
        },
      },
    }
  }
}

function applyReloadBatch(entryKey: string, batch: FetchedHistoryBatch) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing) return prev
    if (!existing.content) {
      return applyInitialBatch(entryKey, batch)(prev)
    }

    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {
          ...existing,
          content: {
            variants: mergeVariantMaps(
              batch.variants,
              existing.content.variants,
              existing.variantIds,
            ),
          },
          error: undefined,
        },
      },
    }
  }
}

function applyLoadMorePage(
  entryKey: string,
  pageVariants: Record<string, VariantTimelineData>,
  nextCursor: string,
) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing?.content) return prev
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {
          ...existing,
          content: {
            variants: mergeVariantMaps(
              existing.content.variants,
              pageVariants,
              existing.variantIds,
            ),
          },
          nextCursor,
          error: undefined,
        },
      },
    }
  }
}

function fetchHistoryBatch(
  client: SanityClient,
  variantIds: readonly string[],
  limit: number,
  nextCursor?: string,
): Observable<FetchedHistoryBatch> {
  return fetchDocumentsHistoryEvents(client, {variantIds, limit, nextCursor}).pipe(
    map(({eventsByVariant, nextCursor: next}) => ({
      variants: normalizeEventsByVariant(variantIds, eventsByVariant),
      nextCursor: next,
    })),
  )
}

interface WatchedVariants {
  variantTypes: Map<string, DocumentVariantType>
  draftPublishedIds: Set<string>
  documentIds: string[]
}

function buildWatchedVariants(variantIds: readonly string[]): WatchedVariants {
  const variantTypes = new Map<string, DocumentVariantType>()
  const draftPublishedIds = new Set<string>()
  const documentIds = new Set<string>(variantIds)
  for (const variantId of variantIds) {
    const variantType = getDocumentVariantType(variantId)
    variantTypes.set(variantId, variantType)
    if (variantType === 'draft') {
      const publishedId = getPublishedId(DocumentId(variantId))
      draftPublishedIds.add(publishedId)
      documentIds.add(publishedId)
    }
  }
  return {variantTypes, draftPublishedIds, documentIds: Array.from(documentIds)}
}

/**
 * Returns a deduplication key when a document change event should trigger a reload:
 * - `null` for `'resync'` (never coalesced across resyncs)
 * - `event.transactionId` for relevant mutations (coalesces multi-doc transactions)
 * - `undefined` when the event does not affect `/events/documents` for any watched variant
 */
function classifyReloadTrigger(
  event: DocumentChangeEvent,
  watched: WatchedVariants,
): string | null | undefined {
  if (event.type === 'resync') return null
  if (event.type !== 'mutation') return undefined

  if (watched.draftPublishedIds.has(event.documentId)) {
    return event.transactionId
  }

  const variantType = watched.variantTypes.get(event.documentId)
  if (!variantType) return undefined

  if (variantType === 'published' || event.transition !== 'update') {
    return event.transactionId
  }

  return undefined
}

function observeHistoryEntry(
  {state, instance, key}: StoreContext<HistoryStoreState, BoundResourceKey>,
  entryKey: string,
): Observable<unknown> {
  const {variantIds, limit} = parseHistoryEntryKey(entryKey)
  const watched = buildWatchedVariants(variantIds)
  const reloadLimit = Math.min(
    DEFAULT_HISTORY_LIMIT,
    Math.max(RELOAD_HISTORY_LIMIT, variantIds.length * 2),
  )
  const clients$ = getClientState(instance, {
    apiVersion: HISTORY_API_VERSION,
    resource: key.resource,
  }).observable
  const credential = getClientAuthState(instance)

  const readBatchWithRetry = (batchLimit: number): Observable<FetchedHistoryBatch> =>
    clients$.pipe(
      first(),
      switchMap((client) => fetchHistoryBatch(client, variantIds, batchLimit)),
      retryRead(credential, (error) =>
        state.set('setHistoryError', setEntryError(entryKey, error)),
      ),
    )

  const initialLoad$ = defer(() => {
    if (state.get().entries[entryKey]?.content) return EMPTY
    return readBatchWithRetry(limit).pipe(
      tap((batch) => state.set('setInitialHistory', applyInitialBatch(entryKey, batch))),
    )
  })

  const reloadOnce$ = defer(() =>
    readBatchWithRetry(reloadLimit).pipe(
      tap((batch) => state.set('applyReloadHistory', applyReloadBatch(entryKey, batch))),
      catchError((error: unknown) => {
        state.set('setHistoryError', setEntryError(entryKey, error))
        return EMPTY
      }),
    ),
  )

  const watchLive$ = defer(() =>
    observeDocumentChanges(instance, {
      resource: key.resource,
      documentIds: watched.documentIds,
    }),
  ).pipe(
    retryRead(credential, (error) => state.set('setHistoryError', setEntryError(entryKey, error))),
    map((event) => classifyReloadTrigger(event, watched)),
    filter((trigger): trigger is string | null => trigger !== undefined),
    distinctUntilChanged((prev, next) => prev !== null && prev === next),
    switchMap(() => reloadOnce$),
  )

  return concat(initialLoad$, watchLive$).pipe(
    catchError((error: unknown) => {
      state.set('setHistoryError', setEntryError(entryKey, error))
      return EMPTY
    }),
  )
}

function watchSubscribedHistoryEntries(context: StoreContext<HistoryStoreState, BoundResourceKey>) {
  return context.state.observable
    .pipe(
      map((current) => new Set(Object.keys(current.entries))),
      distinctUntilChanged(
        (prev, next) => prev.size === next.size && Array.from(next).every((id) => prev.has(id)),
      ),
      startWith(new Set<string>()),
      pairwise(),
      mergeMap(([prev, next]) => [
        ...Array.from(next)
          .filter((id) => !prev.has(id))
          .map((id) => ({entryKey: id, active: true})),
        ...Array.from(prev)
          .filter((id) => !next.has(id))
          .map((id) => ({entryKey: id, active: false})),
      ]),
      groupBy((change) => change.entryKey),
      mergeMap((group$) =>
        group$.pipe(
          switchMap((change) =>
            change.active ? observeHistoryEntry(context, change.entryKey) : EMPTY,
          ),
        ),
      ),
    )
    .subscribe({error: (error: unknown) => context.state.set('setError', {error})})
}

const historyStore = defineStore<HistoryStoreState, BoundResourceKey>({
  name: 'History',
  getInitialState: () => ({
    entries: {},
    inFlightLoadMore: new Map(),
  }),
  initialize: (context) => {
    const subscription = watchSubscribedHistoryEntries(context)
    return () => subscription.unsubscribe()
  },
})

const timelineCache = new WeakMap<HistoryEntryContent, DocumentHistoryEvent[]>()

function selectCachedTimeline(content: HistoryEntryContent): DocumentHistoryEvent[] {
  const cached = timelineCache.get(content)
  if (cached) return cached

  const perVariantTimelines = Object.values(content.variants).map((variant) =>
    variant.apiEvents.length > 0
      ? applyVariantTransforms(sortHistoryEvents(variant.apiEvents), variant.variantType)
      : EMPTY_EVENTS,
  )
  const timeline = mergeVariantTimelines(perVariantTimelines)

  timelineCache.set(content, timeline)
  return timeline
}

function selectHistoryEvents(
  {state}: SelectorContext<HistoryStoreState>,
  request: BoundHistoryRequest,
): DocumentHistoryEvent[] | undefined {
  if (state.error) throw state.error

  const entry = state.entries[toHistoryEntryKey(request.variantIds, request.limit)]
  if (entry?.error && !entry.content) throw entry.error
  if (!entry?.content) return undefined

  return selectCachedTimeline(entry.content)
}

function subscribeToHistoryEntry(
  state: StoreState<HistoryStoreState>,
  entryKey: string,
): () => void {
  const subscriptionId = randomId(16)
  state.set('addHistorySubscriber', addEntrySubscriber(entryKey, subscriptionId))
  return () => {
    setCleanupTimeout(
      () => state.set('removeHistorySubscriber', removeEntrySubscriber(entryKey, subscriptionId)),
      HISTORY_STATE_CLEAR_DELAY,
    )
  }
}

const historyStateAction = createStateSourceAction({
  selector: selectHistoryEvents,
  onSubscribe: ({state}, request: BoundHistoryRequest) =>
    subscribeToHistoryEntry(state, toHistoryEntryKey(request.variantIds, request.limit)),
})

const historyHasMoreStateAction = createStateSourceAction(
  ({state}: SelectorContext<HistoryStoreState>, request: BoundHistoryRequest) =>
    Boolean(state.entries[toHistoryEntryKey(request.variantIds, request.limit)]?.nextCursor),
)

const historyErrorStateAction = createStateSourceAction(
  ({state}: SelectorContext<HistoryStoreState>, request: BoundHistoryRequest) => {
    const entry = state.entries[toHistoryEntryKey(request.variantIds, request.limit)]
    return entry?.content ? entry.error : undefined
  },
)

const boundGetHistoryState = bindActionByResource(
  historyStore,
  (context: StoreContext<HistoryStoreState, BoundResourceKey>, request: BoundHistoryRequest) =>
    historyStateAction(context, request),
)

const boundGetHistoryHasMoreState = bindActionByResource(
  historyStore,
  (context: StoreContext<HistoryStoreState, BoundResourceKey>, request: BoundHistoryRequest) =>
    historyHasMoreStateAction(context, request),
)

const boundGetHistoryErrorState = bindActionByResource(
  historyStore,
  (context: StoreContext<HistoryStoreState, BoundResourceKey>, request: BoundHistoryRequest) =>
    historyErrorStateAction(context, request),
)

function toBoundRequest(resolved: ResolvedDocumentsHistoryRequest): BoundHistoryRequest {
  return {
    resource: resolved.resource,
    variantIds: resolved.variantIds,
    limit: resolved.limit,
  }
}

/**
 * Reactive state source emitting the merged history events for one or more documents ordered
 * newest first, or `undefined` until the initial snapshot has loaded.
 *
 * When `options.documents` is empty, returns a static state source emitting `[]` without making
 * any network requests.
 *
 * @public
 */
export function getDocumentsHistoryState(
  instance: SanityInstance,
  options: DocumentsHistoryOptions,
): StateSource<DocumentHistoryEvent[] | undefined> {
  const resolved = resolveDocumentsHistoryRequest(instance, options)
  if (!resolved) return EMPTY_HISTORY_STATE_SOURCE
  return boundGetHistoryState(instance, toBoundRequest(resolved))
}

/**
 * Reactive state source emitting `true` when older pages of history events can be fetched via
 * {@link loadMoreDocumentsHistory}.
 *
 * @public
 */
export function getDocumentsHistoryHasMoreState(
  instance: SanityInstance,
  options: DocumentsHistoryOptions,
): StateSource<boolean> {
  const resolved = resolveDocumentsHistoryRequest(instance, options)
  if (!resolved) return EMPTY_HAS_MORE_STATE_SOURCE
  return boundGetHistoryHasMoreState(instance, toBoundRequest(resolved))
}

/**
 * Reactive state source emitting any non-fatal error encountered during pagination or live
 * reloads after the initial timeline has loaded.
 *
 * @public
 */
export function getDocumentsHistoryErrorState(
  instance: SanityInstance,
  options: DocumentsHistoryOptions,
): StateSource<unknown> {
  const resolved = resolveDocumentsHistoryRequest(instance, options)
  if (!resolved) return EMPTY_ERROR_STATE_SOURCE
  return boundGetHistoryErrorState(instance, toBoundRequest(resolved))
}

function createAbortStream(
  signal: AbortSignal | undefined,
  onAbort: () => void,
): Observable<never> {
  if (!signal) return NEVER
  return new Observable<never>((observer) => {
    const fail = () => {
      onAbort()
      observer.error(new DOMException('The operation was aborted.', 'AbortError'))
    }
    if (signal.aborted) {
      fail()
      return undefined
    }
    signal.addEventListener('abort', fail)
    return () => signal.removeEventListener('abort', fail)
  })
}

const boundResolveHistory = bindActionByResource(
  historyStore,
  (
    context: StoreContext<HistoryStoreState, BoundResourceKey>,
    {signal, ...request}: BoundResolveHistoryRequest,
  ): Promise<DocumentHistoryEvent[]> => {
    const entryKey = toHistoryEntryKey(request.variantIds, request.limit)
    const {getCurrent} = historyStateAction(context, request)

    const subscriptionId = randomId(16)
    context.state.set('addHistorySubscriber', addEntrySubscriber(entryKey, subscriptionId))
    const releaseNow = () =>
      context.state.set('removeHistorySubscriber', removeEntrySubscriber(entryKey, subscriptionId))

    const aborted$ = createAbortStream(signal, releaseNow)
    const resolved$ = context.state.observable.pipe(
      map(() => getCurrent()),
      first((events): events is DocumentHistoryEvent[] => events !== undefined),
    )

    const promise = firstValueFrom(race([resolved$, aborted$]))
    const releaseLater = () => setCleanupTimeout(releaseNow, HISTORY_STATE_CLEAR_DELAY)
    promise.then(releaseLater, releaseLater)
    return promise
  },
)

/**
 * Resolves once the initial history timeline has loaded. Holds a temporary subscription while
 * resolving so suspended renders participate in normal cleanup.
 *
 * @public
 */
export function resolveDocumentsHistory(
  instance: SanityInstance,
  options: ResolveDocumentsHistoryOptions,
): Promise<DocumentHistoryEvent[]> {
  const resolved = resolveDocumentsHistoryRequest(instance, options)
  if (!resolved) return Promise.resolve(EMPTY_EVENTS)
  return boundResolveHistory(instance, {...toBoundRequest(resolved), signal: options.signal})
}

function fetchHistoryBatchOnce(
  instance: SanityInstance,
  resource: DocumentResource,
  variantIds: readonly string[],
  limit: number,
  nextCursor?: string,
): Promise<FetchedHistoryBatch> {
  return firstValueFrom(
    getClientState(instance, {
      apiVersion: HISTORY_API_VERSION,
      resource,
    }).observable.pipe(
      first(),
      switchMap((client) => fetchHistoryBatch(client, variantIds, limit, nextCursor)),
    ),
  )
}

const boundLoadMoreHistory = bindActionByResource(
  historyStore,
  (
    {state, instance, key}: StoreContext<HistoryStoreState, BoundResourceKey>,
    request: BoundHistoryRequest,
  ): Promise<void> => {
    const entryKey = toHistoryEntryKey(request.variantIds, request.limit)
    const entry = state.get().entries[entryKey]
    if (!entry?.content || !entry.nextCursor) {
      return Promise.resolve()
    }

    const cursor = entry.nextCursor
    const inFlightMap = state.get().inFlightLoadMore
    const existingInFlight = inFlightMap.get(entryKey)
    if (existingInFlight?.cursor === cursor) {
      return existingInFlight.promise
    }

    const promise = fetchHistoryBatchOnce(
      instance,
      key.resource,
      entry.variantIds,
      entry.limit,
      cursor,
    )
      .then((batch) => {
        state.set(
          'appendHistoryPage',
          applyLoadMorePage(entryKey, batch.variants, batch.nextCursor),
        )
      })
      .catch((error: unknown) => {
        state.set('setHistoryError', setEntryError(entryKey, error))
        throw error
      })
      .finally(() => {
        if (inFlightMap.get(entryKey)?.cursor === cursor) {
          inFlightMap.delete(entryKey)
        }
      })

    inFlightMap.set(entryKey, {cursor, promise})
    return promise
  },
)

/**
 * Fetches the next page of older history events using the stored `nextCursor`. Preserves existing
 * events and `nextCursor` if the request fails.
 *
 * @public
 */
export function loadMoreDocumentsHistory(
  instance: SanityInstance,
  options: DocumentsHistoryOptions,
): Promise<void> {
  const resolved = resolveDocumentsHistoryRequest(instance, options)
  if (!resolved) return Promise.resolve()
  return boundLoadMoreHistory(instance, toBoundRequest(resolved))
}

const boundRefetchHistory = bindActionByResource(
  historyStore,
  (
    {state, instance, key}: StoreContext<HistoryStoreState, BoundResourceKey>,
    request: BoundHistoryRequest,
  ): Promise<void> => {
    const entryKey = toHistoryEntryKey(request.variantIds, request.limit)
    const entry = state.get().entries[entryKey]
    if (!entry) {
      return boundResolveHistory(instance, request).then(() => {})
    }

    return fetchHistoryBatchOnce(instance, key.resource, entry.variantIds, entry.limit)
      .then((batch) => {
        state.set('refetchHistory', applyReloadBatch(entryKey, batch))
      })
      .catch((error: unknown) => {
        state.set('setHistoryError', setEntryError(entryKey, error))
        throw error
      })
  },
)

/**
 * Reloads the latest history events from Content Lake while preserving any pagination cursor
 * already loaded.
 *
 * @public
 */
export function refetchDocumentsHistory(
  instance: SanityInstance,
  options: DocumentsHistoryOptions,
): Promise<void> {
  const resolved = resolveDocumentsHistoryRequest(instance, options)
  if (!resolved) return Promise.resolve()
  return boundRefetchHistory(instance, toBoundRequest(resolved))
}
