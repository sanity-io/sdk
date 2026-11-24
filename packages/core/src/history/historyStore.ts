import {type SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'
import {
  catchError,
  defer,
  distinctUntilChanged,
  EMPTY,
  first,
  firstValueFrom,
  groupBy,
  map,
  merge,
  mergeMap,
  NEVER,
  Observable,
  of,
  pairwise,
  race,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs'

import {getClientAuthState} from '../auth/authStore'
import {getClientState} from '../client/clientStore'
import {retryRead} from '../client/retry'
import {type DocumentResource} from '../config/sanityConfig'
import {
  type DocumentChangeEvent,
  type DocumentMutationChangeEvent,
  observeDocumentChanges,
} from '../document/documentChangeSource'
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
  type ActiveVariantTransactionsResult,
  type ActiveVariantTransactionsTarget,
  fetchActiveVariantTransactions,
  fetchDocumentsHistoryEvents,
  HISTORY_API_VERSION,
} from './historyClient'
import {
  DEFAULT_HISTORY_LIMIT,
  getDocumentVariantType,
  type ResolvedDocumentsHistoryRequest,
  resolveDocumentsHistoryRequest,
} from './historyOptions'
import {
  applyFetchedActiveTransactions,
  applyLiveVariantMutationToVariants,
  buildVariantTimeline,
  getActiveTargetsForInitialLoad,
  getActiveTargetsForReload,
  mergeLoadMoreVariants,
  mergeReloadVariants,
  normalizeEventsByVariant,
  type PreFetchVariantSnapshot,
  snapshotPreFetchVariants,
  type VariantTimelineData,
} from './historyVariantState'
import {mergeVariantTimelines} from './normalizeHistoryEvents'
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
  fetchedActiveByVariant?: Record<string, ActiveVariantTransactionsResult>
  activeEditsError?: unknown
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

function applyInitialBatch(
  entryKey: string,
  batch: FetchedHistoryBatch,
  bufferedEvents: readonly DocumentChangeEvent[] = [],
) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing) return prev

    let variants = batch.variants
    for (const event of bufferedEvents) {
      if (event.type === 'mutation') {
        variants = applyLiveVariantMutationToVariants(variants, event)
      }
    }

    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {
          ...existing,
          content: {variants},
          nextCursor: batch.nextCursor,
          error: batch.activeEditsError,
        },
      },
    }
  }
}

function applyReloadBatch(
  entryKey: string,
  batch: FetchedHistoryBatch,
  preFetchSnapshots: Map<string, PreFetchVariantSnapshot>,
) {
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
            variants: mergeReloadVariants(
              existing.content.variants,
              batch.variants,
              existing.variantIds,
              batch.fetchedActiveByVariant,
              preFetchSnapshots,
            ),
          },
          error: batch.activeEditsError,
        },
      },
    }
  }
}

function applyLiveMutation(entryKey: string, event: DocumentMutationChangeEvent) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing?.content) return prev
    const nextVariants = applyLiveVariantMutationToVariants(existing.content.variants, event)
    if (nextVariants === existing.content.variants) return prev
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {
          ...existing,
          content: {variants: nextVariants},
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
            variants: mergeLoadMoreVariants(
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

function fetchActiveTransactionsSafe(
  client: SanityClient,
  targets: readonly ActiveVariantTransactionsTarget[],
): Observable<{
  fetched: Record<string, ActiveVariantTransactionsResult> | undefined
  error: unknown
}> {
  if (targets.length === 0) {
    return of({fetched: undefined, error: undefined})
  }
  return fetchActiveVariantTransactions(client, targets).pipe(
    map((fetched) => ({fetched, error: undefined})),
    catchError((error: unknown) => of({fetched: undefined, error})),
  )
}

interface WatchedVariants {
  variantTypes: Map<string, DocumentVariantType>
  variantPublishedIds: Set<string>
  documentIds: string[]
}

function buildWatchedVariants(variantIds: readonly string[]): WatchedVariants {
  const variantTypes = new Map<string, DocumentVariantType>()
  const variantPublishedIds = new Set<string>()
  const documentIds = new Set<string>(variantIds)
  for (const variantId of variantIds) {
    const variantType = getDocumentVariantType(variantId)
    variantTypes.set(variantId, variantType)
    if (variantType !== 'published') {
      const publishedId = getPublishedId(DocumentId(variantId))
      variantPublishedIds.add(publishedId)
      documentIds.add(publishedId)
    }
  }
  return {variantTypes, variantPublishedIds, documentIds: Array.from(documentIds)}
}

type ReloadTrigger = {kind: 'resync'} | {kind: 'mutation'; id: string}

/**
 * Classifies a document change event into a reload trigger:
 * - `{kind: 'resync'}` for `'resync'` (never coalesced; refreshes all active transactions)
 * - `{kind: 'mutation', id}` for semantic lifecycle / published mutations (coalesces multi-doc tx)
 * - `undefined` for draft/version `'update'` mutations (handled in-memory without a reload)
 */
function classifyReloadTrigger(
  event: DocumentChangeEvent,
  watched: WatchedVariants,
): ReloadTrigger | undefined {
  if (event.type === 'resync') return {kind: 'resync'}
  if (event.type !== 'mutation') return undefined

  if (watched.variantPublishedIds.has(event.documentId)) {
    return {kind: 'mutation', id: event.transactionId}
  }

  const variantType = watched.variantTypes.get(event.documentId)
  if (!variantType) return undefined

  if (variantType === 'published' || event.transition !== 'update') {
    return {kind: 'mutation', id: event.transactionId}
  }

  return undefined
}

function collapseBufferedReloadTriggers(
  buffered: readonly DocumentChangeEvent[],
  watched: WatchedVariants,
): ReloadTrigger | undefined {
  let lastMutationTrigger: ReloadTrigger | undefined
  for (const event of buffered) {
    const trigger = classifyReloadTrigger(event, watched)
    if (!trigger) continue
    if (trigger.kind === 'resync') return trigger
    lastMutationTrigger = trigger
  }
  return lastMutationTrigger
}

function fetchInitialWithActiveEdits(
  clients$: Observable<SanityClient>,
  credential: ReturnType<typeof getClientAuthState>,
  variantIds: readonly string[],
  limit: number,
  onError: (error: unknown) => void,
): Observable<FetchedHistoryBatch> {
  return clients$.pipe(
    first(),
    switchMap((client) =>
      fetchHistoryBatch(client, variantIds, limit).pipe(
        retryRead(credential, onError),
        switchMap((batch) => {
          const targets = getActiveTargetsForInitialLoad(batch.variants)
          return fetchActiveTransactionsSafe(client, targets).pipe(
            map(({fetched, error}) => ({
              variants: fetched
                ? applyFetchedActiveTransactions(batch.variants, fetched)
                : batch.variants,
              nextCursor: batch.nextCursor,
              activeEditsError: error,
            })),
          )
        }),
      ),
    ),
  )
}

function attachReloadActiveTransactions(
  client: SanityClient,
  batch: FetchedHistoryBatch,
  existingVariants: Record<string, VariantTimelineData> | undefined,
  variantIds: readonly string[],
  refreshAllActive: boolean,
): Observable<FetchedHistoryBatch> {
  const targets = getActiveTargetsForReload(
    existingVariants,
    batch.variants,
    variantIds,
    refreshAllActive,
  )
  return fetchActiveTransactionsSafe(client, targets).pipe(
    map(({fetched, error}) => ({
      ...batch,
      fetchedActiveByVariant: fetched,
      activeEditsError: error,
    })),
  )
}

function runReloadOnce({
  state,
  entryKey,
  clients$,
  credential,
  variantIds,
  reloadLimit,
  refreshAllActive,
}: {
  state: StoreState<HistoryStoreState>
  entryKey: string
  clients$: Observable<SanityClient>
  credential: ReturnType<typeof getClientAuthState>
  variantIds: readonly string[]
  reloadLimit: number
  refreshAllActive: boolean
}): Observable<unknown> {
  return defer(() => {
    const preFetchSnapshots = snapshotPreFetchVariants(
      state.get().entries[entryKey]?.content?.variants,
    )
    const onError = (error: unknown) => state.set('setHistoryError', setEntryError(entryKey, error))

    return clients$.pipe(
      first(),
      switchMap((client) =>
        fetchHistoryBatch(client, variantIds, reloadLimit).pipe(
          retryRead(credential, onError),
          switchMap((batch) =>
            attachReloadActiveTransactions(
              client,
              batch,
              state.get().entries[entryKey]?.content?.variants,
              variantIds,
              refreshAllActive,
            ),
          ),
        ),
      ),
      tap((batch) =>
        state.set('applyReloadHistory', applyReloadBatch(entryKey, batch, preFetchSnapshots)),
      ),
      catchError((error: unknown) => {
        onError(error)
        return EMPTY
      }),
    )
  })
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
  const onError = (error: unknown) => state.set('setHistoryError', setEntryError(entryKey, error))

  return defer(() => {
    const bufferedDuringInitial: DocumentChangeEvent[] = []
    let initialLoaded = Boolean(state.get().entries[entryKey]?.content)
    const reloadTriggers$ = new Subject<ReloadTrigger>()

    const liveChanges$ = observeDocumentChanges(instance, {
      resource: key.resource,
      documentIds: watched.documentIds,
    }).pipe(
      retryRead(credential, onError),
      tap((event) => {
        if (!initialLoaded) {
          if (event.type !== 'connected') {
            bufferedDuringInitial.push(event)
          }
          return
        }
        if (event.type === 'mutation') {
          state.set('applyLiveHistoryMutation', applyLiveMutation(entryKey, event))
        }
        const trigger = classifyReloadTrigger(event, watched)
        if (trigger !== undefined) {
          reloadTriggers$.next(trigger)
        }
      }),
    )

    const initialLoad$ = initialLoaded
      ? EMPTY
      : fetchInitialWithActiveEdits(clients$, credential, variantIds, limit, onError).pipe(
          tap((batch) => {
            state.set(
              'setInitialHistory',
              applyInitialBatch(entryKey, batch, bufferedDuringInitial),
            )
            initialLoaded = true
            const bufferedTrigger = collapseBufferedReloadTriggers(bufferedDuringInitial, watched)
            bufferedDuringInitial.length = 0
            if (bufferedTrigger !== undefined) {
              reloadTriggers$.next(bufferedTrigger)
            }
          }),
        )

    const reloads$ = reloadTriggers$.pipe(
      distinctUntilChanged(
        (prev, next) => prev.kind === 'mutation' && next.kind === 'mutation' && prev.id === next.id,
      ),
      switchMap((trigger) =>
        runReloadOnce({
          state,
          entryKey,
          clients$,
          credential,
          variantIds,
          reloadLimit,
          refreshAllActive: trigger.kind === 'resync',
        }),
      ),
    )

    return merge(liveChanges$, initialLoad$, reloads$).pipe(
      catchError((error: unknown) => {
        onError(error)
        return EMPTY
      }),
    )
  })
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

  const perVariantTimelines = Object.values(content.variants).map(buildVariantTimeline)
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

function getLoadedHistoryEntry(
  state: StoreState<HistoryStoreState>,
  request: BoundHistoryRequest,
): {entryKey: string; entry: HistoryEntryState & {content: HistoryEntryContent}} | undefined {
  const entryKey = toHistoryEntryKey(request.variantIds, request.limit)
  const entry = state.get().entries[entryKey]
  if (!entry?.content) return undefined
  return {entryKey, entry: entry as HistoryEntryState & {content: HistoryEntryContent}}
}

const boundLoadMoreHistory = bindActionByResource(
  historyStore,
  (
    {state, instance, key}: StoreContext<HistoryStoreState, BoundResourceKey>,
    request: BoundHistoryRequest,
  ): Promise<void> => {
    const loaded = getLoadedHistoryEntry(state, request)
    if (!loaded || !loaded.entry.nextCursor) {
      return Promise.resolve()
    }

    const {entryKey, entry} = loaded
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
    const loaded = getLoadedHistoryEntry(state, request)
    if (!loaded) {
      return boundResolveHistory(instance, request).then(() => {})
    }

    const {entryKey, entry} = loaded
    const preFetchSnapshots = snapshotPreFetchVariants(entry.content.variants)

    return firstValueFrom(
      getClientState(instance, {
        apiVersion: HISTORY_API_VERSION,
        resource: key.resource,
      }).observable.pipe(
        first(),
        switchMap((client) =>
          fetchHistoryBatch(client, entry.variantIds, entry.limit).pipe(
            switchMap((batch) =>
              attachReloadActiveTransactions(
                client,
                batch,
                state.get().entries[entryKey]?.content?.variants,
                entry.variantIds,
                true,
              ),
            ),
          ),
        ),
      ),
    )
      .then((batch) => {
        state.set('refetchHistory', applyReloadBatch(entryKey, batch, preFetchSnapshots))
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
