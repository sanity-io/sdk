import {
  type ListenEvent,
  type MutationEvent,
  type SanityClient,
  type SanityDocument,
} from '@sanity/client'
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
import {type DocumentHandle, type DocumentResource} from '../config/sanityConfig'
import {getSharedListenerEvents} from '../document/documentStore'
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
  fetchDocumentHistoryEvents,
  fetchDocumentTransactions,
  HISTORY_API_VERSION,
} from './historyClient'
import {getDocumentVariantType, resolveHistoryDocumentId} from './historyOptions'
import {
  applyVariantTransforms,
  assignEventId,
  dedupeHistoryEvents,
  findEditEventsBaseline,
  getEditEvents,
  groupEditTransactions,
  mergeEditEvents,
  sortHistoryEvents,
  withHistoryClearedEvent,
} from './synthesizeEditEvents'
import {
  type CreateDocumentVersionHistoryEvent,
  type DeleteDocumentVersionHistoryEvent,
  type DocumentHistoryEditTransaction,
  type DocumentHistoryEvent,
  type DocumentHistoryOptions,
  type DocumentVariantType,
  type EditDocumentVersionHistoryEvent,
  isDeleteDocumentVersionHistoryEvent,
  isPublishDocumentVersionHistoryEvent,
  type PublishDocumentVersionHistoryEvent,
  type ResolveDocumentHistoryOptions,
} from './types'

const HISTORY_STATE_CLEAR_DELAY = 5000
const DEFAULT_HISTORY_LIMIT = 100
const RELOAD_HISTORY_LIMIT = 10
const DEFAULT_INCLUDE_EDIT_EVENTS = true

type WithResource<T> = T & {resource: DocumentResource}

interface HistoryEntryContent {
  variantId: string
  variantType: DocumentVariantType
  apiEvents: DocumentHistoryEvent[]
  fetchedEditEvents: DocumentHistoryEvent[]
  liveEditTransactions: DocumentHistoryEditTransaction[]
  expandedEvents: Record<string, EditDocumentVersionHistoryEvent[]>
}

interface HistoryEntryState {
  subscribers: string[]
  variantId: string
  variantType: DocumentVariantType
  limit: number
  includeEditEvents: boolean
  content?: HistoryEntryContent
  nextCursor: string
  baselineRevisionId?: string
  error?: unknown
}

interface HistoryStoreState {
  entries: Record<string, HistoryEntryState | undefined>
  inFlightLoadMore: Map<string, {cursor: string; promise: Promise<void>}>
  inFlightExpand: Map<string, Promise<void>>
  error?: unknown
}

interface FetchedHistoryBatch {
  apiEvents: DocumentHistoryEvent[]
  fetchedEditEvents: DocumentHistoryEvent[]
  nextCursor: string
  baselineRevisionId?: string
}

type ListenerHistoryAction =
  | {type: 'append-edit'; transaction: DocumentHistoryEditTransaction}
  | {type: 'reload'}

function withSynthesizedResource<T extends DocumentHandle>(options: T): T {
  if (!options.resource && options.projectId && options.dataset) {
    return {...options, resource: {projectId: options.projectId, dataset: options.dataset}}
  }
  return options
}

function toHistoryEntryKey(
  instance: SanityInstance,
  options: WithResource<DocumentHistoryOptions>,
): string {
  const variantId = resolveHistoryDocumentId(
    {...options, perspective: options.perspective ?? instance.config.perspective},
    options.resource,
  )
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT
  const includeEditEvents = options.includeEditEvents ?? DEFAULT_INCLUDE_EDIT_EVENTS
  return `${variantId}:${limit}:${includeEditEvents}`
}

function parseHistoryEntryKey(entryKey: string): {
  variantId: string
  limit: number
  includeEditEvents: boolean
} {
  const lastColon = entryKey.lastIndexOf(':')
  const prevColon = entryKey.lastIndexOf(':', lastColon - 1)
  return {
    variantId: entryKey.slice(0, prevColon),
    limit: Number(entryKey.slice(prevColon + 1, lastColon)),
    includeEditEvents: entryKey.slice(lastColon + 1) === 'true',
  }
}

function createEmptyEntry(entryKey: string): HistoryEntryState {
  const {variantId, limit, includeEditEvents} = parseHistoryEntryKey(entryKey)
  return {
    subscribers: [],
    variantId,
    variantType: getDocumentVariantType(variantId),
    limit,
    includeEditEvents,
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
          content: {
            variantId: existing.variantId,
            variantType: existing.variantType,
            apiEvents: batch.apiEvents,
            fetchedEditEvents: batch.fetchedEditEvents,
            liveEditTransactions: [],
            expandedEvents: existing.content?.expandedEvents ?? {},
          },
          nextCursor: batch.nextCursor,
          baselineRevisionId: batch.baselineRevisionId ?? existing.baselineRevisionId,
          error: undefined,
        },
      },
    }
  }
}

function applyReloadBatch(
  entryKey: string,
  batch: FetchedHistoryBatch,
  capturedLiveRevIds: ReadonlySet<string>,
) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing) return prev
    if (!existing.content) {
      return applyInitialBatch(entryKey, batch)(prev)
    }

    const remainingLive = existing.content.liveEditTransactions.filter(
      (tx) => !capturedLiveRevIds.has(tx.revisionId),
    )

    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: {
          ...existing,
          content: {
            ...existing.content,
            apiEvents: dedupeHistoryEvents(batch.apiEvents, existing.content.apiEvents),
            fetchedEditEvents: batch.fetchedEditEvents,
            liveEditTransactions: remainingLive,
          },
          baselineRevisionId: batch.baselineRevisionId ?? existing.baselineRevisionId,
          error: undefined,
        },
      },
    }
  }
}

function updateLoadedEntry(
  entryKey: string,
  updater: (
    existing: HistoryEntryState & {content: HistoryEntryContent},
  ) => HistoryEntryState | undefined,
) {
  return (prev: HistoryStoreState): HistoryStoreState => {
    const existing = prev.entries[entryKey]
    if (!existing?.content) return prev
    const updated = updater(existing as HistoryEntryState & {content: HistoryEntryContent})
    if (!updated) return prev
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [entryKey]: updated,
      },
    }
  }
}

function applyLoadMorePage(
  entryKey: string,
  pageEvents: DocumentHistoryEvent[],
  nextCursor: string,
) {
  return updateLoadedEntry(entryKey, (existing) => ({
    ...existing,
    content: {
      ...existing.content,
      apiEvents: dedupeHistoryEvents(existing.content.apiEvents, pageEvents),
    },
    nextCursor,
    baselineRevisionId:
      existing.baselineRevisionId ?? findEditEventsBaseline(pageEvents, existing.variantType),
    error: undefined,
  }))
}

function appendLiveEditTransaction(entryKey: string, transaction: DocumentHistoryEditTransaction) {
  return updateLoadedEntry(entryKey, (existing) => {
    if (
      existing.content.liveEditTransactions.some((tx) => tx.revisionId === transaction.revisionId)
    ) {
      return undefined
    }
    return {
      ...existing,
      content: {
        ...existing.content,
        liveEditTransactions: [...existing.content.liveEditTransactions, transaction],
      },
    }
  })
}

function applyExpandedEvents(
  entryKey: string,
  eventId: string,
  editEvents: EditDocumentVersionHistoryEvent[],
) {
  return updateLoadedEntry(entryKey, (existing) => ({
    ...existing,
    content: {
      ...existing.content,
      expandedEvents: {
        ...existing.content.expandedEvents,
        [eventId]: editEvents,
      },
    },
    error: undefined,
  }))
}

function fetchHistoryBatch(
  client: SanityClient,
  {
    variantId,
    variantType,
    limit,
    includeEditEvents,
    storedBaselineRevisionId,
  }: {
    variantId: string
    variantType: DocumentVariantType
    limit: number
    includeEditEvents: boolean
    storedBaselineRevisionId?: string
  },
): Observable<FetchedHistoryBatch> {
  return fetchDocumentHistoryEvents(client, {variantId, limit}).pipe(
    switchMap(({events: rawEvents, nextCursor}) => {
      const apiEvents = rawEvents.map((ev) => assignEventId(ev, variantType))
      const baselineRevisionId =
        findEditEventsBaseline(apiEvents, variantType) ?? storedBaselineRevisionId

      if (!includeEditEvents || variantType === 'published') {
        return of({
          apiEvents,
          fetchedEditEvents: [],
          nextCursor,
          baselineRevisionId,
        })
      }

      return fetchDocumentTransactions(client, {
        variantId,
        fromTransaction: baselineRevisionId ?? '',
      }).pipe(
        map((transactions) => ({
          apiEvents,
          fetchedEditEvents: withHistoryClearedEvent(getEditEvents(transactions, variantId), {
            apiEvents,
            variantId,
            variantType,
          }),
          nextCursor,
          baselineRevisionId,
        })),
      )
    }),
  )
}

interface MutationClassifierContext {
  variantId: string
  publishedId: string
  variantType: DocumentVariantType
  includeEditEvents: boolean
}

function isLiveVariantEditMutation(
  event: MutationEvent<SanityDocument>,
  ctx: MutationClassifierContext,
): boolean {
  if (!ctx.includeEditEvents || ctx.variantType === 'published') return false
  return event.documentId === ctx.variantId && event.transition === 'update'
}

function isReloadMutation(
  event: MutationEvent<SanityDocument>,
  ctx: MutationClassifierContext,
): boolean {
  if (event.documentId === ctx.publishedId && ctx.variantType === 'draft') {
    return true
  }
  if (event.documentId !== ctx.variantId) {
    return false
  }
  return ctx.variantType === 'published' || event.transition !== 'update'
}

function classifyMutationForHistory(
  event: ListenEvent<SanityDocument>,
  ctx: MutationClassifierContext,
): ListenerHistoryAction | undefined {
  if (event.type === 'reset') return {type: 'reload'}
  if (event.type !== 'mutation') return undefined

  if (isLiveVariantEditMutation(event, ctx)) {
    return {
      type: 'append-edit',
      transaction: {
        type: 'editTransaction',
        author: event.identity,
        timestamp: event.timestamp,
        revisionId: event.resultRev ?? event.transactionId,
      },
    }
  }

  return isReloadMutation(event, ctx) ? {type: 'reload'} : undefined
}

function observeHistoryEntry(
  {state, instance, key}: StoreContext<HistoryStoreState, BoundResourceKey>,
  entryKey: string,
): Observable<unknown> {
  const {variantId, limit, includeEditEvents} = parseHistoryEntryKey(entryKey)
  const variantType = getDocumentVariantType(variantId)
  const publishedId = getPublishedId(DocumentId(variantId))
  const clients$ = getClientState(instance, {
    apiVersion: HISTORY_API_VERSION,
    resource: key.resource,
  }).observable
  const credential = getClientAuthState(instance)

  const readBatchWithRetry = (batchLimit: number): Observable<FetchedHistoryBatch> =>
    clients$.pipe(
      first(),
      switchMap((client) =>
        fetchHistoryBatch(client, {
          variantId,
          variantType,
          limit: batchLimit,
          includeEditEvents,
          storedBaselineRevisionId: state.get().entries[entryKey]?.baselineRevisionId,
        }),
      ),
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

  const reloadOnce$ = defer(() => {
    const capturedLiveRevIds = new Set(
      state.get().entries[entryKey]?.content?.liveEditTransactions.map((tx) => tx.revisionId) ?? [],
    )
    return readBatchWithRetry(RELOAD_HISTORY_LIMIT).pipe(
      tap((batch) =>
        state.set('applyReloadHistory', applyReloadBatch(entryKey, batch, capturedLiveRevIds)),
      ),
      catchError((error: unknown) => {
        state.set('setHistoryError', setEntryError(entryKey, error))
        return EMPTY
      }),
    )
  })

  const watchLive$ = defer(() => getSharedListenerEvents(instance, {resource: key.resource})).pipe(
    retryRead(credential, (error) => state.set('setHistoryError', setEntryError(entryKey, error))),
    map((event) =>
      classifyMutationForHistory(event, {
        variantId,
        publishedId,
        variantType,
        includeEditEvents,
      }),
    ),
    filter((action): action is ListenerHistoryAction => action !== undefined),
    tap((action) => {
      if (action.type === 'append-edit') {
        state.set('appendLiveEdit', appendLiveEditTransaction(entryKey, action.transaction))
      }
    }),
    filter((action): action is {type: 'reload'} => action.type === 'reload'),
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
    inFlightExpand: new Map(),
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

  const baseEvents = dedupeHistoryEvents(content.fetchedEditEvents, content.apiEvents)
  const liveEdits =
    content.liveEditTransactions.length > 0
      ? groupEditTransactions(content.liveEditTransactions, content.variantId)
      : []
  const expanded = Object.values(content.expandedEvents).flat()
  const sorted = sortHistoryEvents([...dedupeHistoryEvents(liveEdits, baseEvents), ...expanded])
  const timeline = applyVariantTransforms(mergeEditEvents(sorted), content.variantType)

  timelineCache.set(content, timeline)
  return timeline
}

function selectHistoryEvents(
  {state, instance}: SelectorContext<HistoryStoreState>,
  options: WithResource<DocumentHistoryOptions>,
): DocumentHistoryEvent[] | undefined {
  if (state.error) throw state.error

  const entry = state.entries[toHistoryEntryKey(instance, options)]
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
  onSubscribe: ({state, instance}, options: WithResource<DocumentHistoryOptions>) =>
    subscribeToHistoryEntry(state, toHistoryEntryKey(instance, options)),
})

const historyHasMoreStateAction = createStateSourceAction(
  (
    {state, instance}: SelectorContext<HistoryStoreState>,
    options: WithResource<DocumentHistoryOptions>,
  ) => Boolean(state.entries[toHistoryEntryKey(instance, options)]?.nextCursor),
)

const historyErrorStateAction = createStateSourceAction(
  (
    {state, instance}: SelectorContext<HistoryStoreState>,
    options: WithResource<DocumentHistoryOptions>,
  ) => {
    const entry = state.entries[toHistoryEntryKey(instance, options)]
    return entry?.content ? entry.error : undefined
  },
)

const boundGetHistoryState = bindActionByResource(
  historyStore,
  (context: StoreContext<HistoryStoreState, BoundResourceKey>, options: DocumentHistoryOptions) =>
    historyStateAction(context, {...options, resource: context.key.resource}),
)

const boundGetHistoryHasMoreState = bindActionByResource(
  historyStore,
  (context: StoreContext<HistoryStoreState, BoundResourceKey>, options: DocumentHistoryOptions) =>
    historyHasMoreStateAction(context, {...options, resource: context.key.resource}),
)

const boundGetHistoryErrorState = bindActionByResource(
  historyStore,
  (context: StoreContext<HistoryStoreState, BoundResourceKey>, options: DocumentHistoryOptions) =>
    historyErrorStateAction(context, {...options, resource: context.key.resource}),
)

/**
 * Reactive state source emitting a document's history events ordered newest first, or `undefined`
 * until the initial snapshot has loaded.
 *
 * @beta
 */
export function getDocumentHistoryState(
  instance: SanityInstance,
  options: DocumentHistoryOptions,
): StateSource<DocumentHistoryEvent[] | undefined> {
  return boundGetHistoryState(instance, withSynthesizedResource(options))
}

/**
 * Reactive state source emitting `true` when older pages of history events can be fetched via
 * {@link loadMoreDocumentHistory}.
 *
 * @beta
 */
export function getDocumentHistoryHasMoreState(
  instance: SanityInstance,
  options: DocumentHistoryOptions,
): StateSource<boolean> {
  return boundGetHistoryHasMoreState(instance, withSynthesizedResource(options))
}

/**
 * Reactive state source emitting any non-fatal error encountered during pagination, event
 * expansion, or live reloads after the initial timeline has loaded.
 *
 * @beta
 */
export function getDocumentHistoryErrorState(
  instance: SanityInstance,
  options: DocumentHistoryOptions,
): StateSource<unknown> {
  return boundGetHistoryErrorState(instance, withSynthesizedResource(options))
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
    {signal, ...options}: ResolveDocumentHistoryOptions,
  ): Promise<DocumentHistoryEvent[]> => {
    const withResource: WithResource<DocumentHistoryOptions> = {
      ...options,
      resource: context.key.resource,
    }
    const entryKey = toHistoryEntryKey(context.instance, withResource)
    const {getCurrent} = historyStateAction(context, withResource)

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
 * Resolves once the initial document history timeline has loaded. Holds a temporary subscription
 * while resolving so suspended renders participate in normal cleanup.
 *
 * @beta
 */
export function resolveDocumentHistory(
  instance: SanityInstance,
  options: ResolveDocumentHistoryOptions,
): Promise<DocumentHistoryEvent[]> {
  return boundResolveHistory(instance, withSynthesizedResource(options))
}

const boundLoadMoreHistory = bindActionByResource(
  historyStore,
  (
    {state, instance, key}: StoreContext<HistoryStoreState, BoundResourceKey>,
    options: DocumentHistoryOptions,
  ): Promise<void> => {
    const entryKey = toHistoryEntryKey(instance, {...options, resource: key.resource})
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

    const promise = firstValueFrom(
      getClientState(instance, {
        apiVersion: HISTORY_API_VERSION,
        resource: key.resource,
      }).observable.pipe(
        first(),
        switchMap((client) =>
          fetchDocumentHistoryEvents(client, {
            variantId: entry.variantId,
            limit: entry.limit,
            nextCursor: cursor,
          }),
        ),
      ),
    )
      .then(({events: rawEvents, nextCursor}) => {
        const pageEvents = rawEvents.map((ev) => assignEventId(ev, entry.variantType))
        state.set('appendHistoryPage', applyLoadMorePage(entryKey, pageEvents, nextCursor))
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
 * @beta
 */
export function loadMoreDocumentHistory(
  instance: SanityInstance,
  options: DocumentHistoryOptions,
): Promise<void> {
  return boundLoadMoreHistory(instance, withSynthesizedResource(options))
}

function isExpandableEvent(event: DocumentHistoryEvent | undefined): event is (
  | PublishDocumentVersionHistoryEvent
  | DeleteDocumentVersionHistoryEvent
) & {
  versionRevisionId: string
  creationEvent: CreateDocumentVersionHistoryEvent
} {
  return Boolean(
    event &&
    (isPublishDocumentVersionHistoryEvent(event) || isDeleteDocumentVersionHistoryEvent(event)) &&
    event.versionRevisionId &&
    event.creationEvent,
  )
}

const boundExpandHistoryEvent = bindActionByResource(
  historyStore,
  (
    {state, instance, key}: StoreContext<HistoryStoreState, BoundResourceKey>,
    options: DocumentHistoryOptions,
    eventId: string,
  ): Promise<void> => {
    const entryKey = toHistoryEntryKey(instance, {...options, resource: key.resource})
    const entry = state.get().entries[entryKey]
    if (!entry?.content || entry.content.expandedEvents[eventId]) {
      return Promise.resolve()
    }

    const timeline = selectCachedTimeline(entry.content)
    const target = timeline.find((ev) => ev.id === eventId)
    if (!isExpandableEvent(target)) {
      return Promise.resolve()
    }

    const expandKey = `${entryKey}::${eventId}`
    const inFlightExpand = state.get().inFlightExpand
    const existing = inFlightExpand.get(expandKey)
    if (existing) return existing

    const promise = firstValueFrom(
      getClientState(instance, {
        apiVersion: HISTORY_API_VERSION,
        resource: key.resource,
      }).observable.pipe(
        first(),
        switchMap((client) =>
          fetchDocumentTransactions(client, {
            variantId: entry.variantId,
            fromTransaction: target.creationEvent.versionRevisionId,
            toTransaction: target.versionRevisionId,
          }),
        ),
      ),
    )
      .then((transactions) => {
        const editEvents = getEditEvents(transactions, entry.variantId).map((ev) => ({
          ...ev,
          parentId: target.id,
        }))
        state.set('setExpandedHistoryEvents', applyExpandedEvents(entryKey, eventId, editEvents))
      })
      .catch((error: unknown) => {
        state.set('setHistoryError', setEntryError(entryKey, error))
        throw error
      })
      .finally(() => {
        inFlightExpand.delete(expandKey)
      })

    inFlightExpand.set(expandKey, promise)
    return promise
  },
)

/**
 * Expands a draft `publishDocumentVersion` or `deleteDocumentVersion` event by fetching and
 * synthesizing the intermediate `editDocumentVersion` events between its creation and completion.
 *
 * @beta
 */
export function expandDocumentHistoryEvent(
  instance: SanityInstance,
  options: DocumentHistoryOptions,
  eventId: string,
): Promise<void> {
  return boundExpandHistoryEvent(instance, withSynthesizedResource(options), eventId)
}

const boundRefetchHistory = bindActionByResource(
  historyStore,
  (
    {state, instance, key}: StoreContext<HistoryStoreState, BoundResourceKey>,
    options: DocumentHistoryOptions,
  ): Promise<void> => {
    const withResource: WithResource<DocumentHistoryOptions> = {
      ...options,
      resource: key.resource,
    }
    const entryKey = toHistoryEntryKey(instance, withResource)
    const entry = state.get().entries[entryKey]
    if (!entry) {
      return boundResolveHistory(instance, withResource).then(() => {})
    }

    const capturedLiveRevIds = new Set(
      entry.content?.liveEditTransactions.map((tx) => tx.revisionId) ?? [],
    )

    return firstValueFrom(
      getClientState(instance, {
        apiVersion: HISTORY_API_VERSION,
        resource: key.resource,
      }).observable.pipe(
        first(),
        switchMap((client) =>
          fetchHistoryBatch(client, {
            variantId: entry.variantId,
            variantType: entry.variantType,
            limit: entry.limit,
            includeEditEvents: entry.includeEditEvents,
            storedBaselineRevisionId: entry.baselineRevisionId,
          }),
        ),
      ),
    )
      .then((batch) => {
        state.set('refetchHistory', applyReloadBatch(entryKey, batch, capturedLiveRevIds))
      })
      .catch((error: unknown) => {
        state.set('setHistoryError', setEntryError(entryKey, error))
        throw error
      })
  },
)

/**
 * Reloads the latest history events (and synthesized edit transactions when enabled) from Content
 * Lake while preserving any pagination cursor already loaded.
 *
 * @beta
 */
export function refetchDocumentHistory(
  instance: SanityInstance,
  options: DocumentHistoryOptions,
): Promise<void> {
  return boundRefetchHistory(instance, withSynthesizedResource(options))
}
