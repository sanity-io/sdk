import {type DocumentMutationChangeEvent} from '../document/documentChangeSource'
import {
  type ActiveVariantTransactionsResult,
  type ActiveVariantTransactionsTarget,
  type RawDocumentHistoryEvent,
} from './historyClient'
import {getDocumentVariantType} from './historyOptions'
import {
  applyVariantTransforms,
  dedupeHistoryEvents,
  normalizeHistoryEvent,
  orderEventsByTimestamp,
} from './normalizeHistoryEvents'
import {
  type ActiveEditTransaction,
  extractActiveEditTransactions,
  synthesizeActiveEditEvents,
} from './synthesizeEditEvents'
import {type DocumentHistoryEvent, type DocumentVariantType} from './types'

const EMPTY_EVENTS: DocumentHistoryEvent[] = []
const EMPTY_ACTIVE_TRANSACTIONS: ActiveEditTransaction[] = []

/**
 * Per-variant timeline data stored inside a history cache entry.
 *
 * @internal
 */
export interface VariantTimelineData {
  variantId: string
  variantType: DocumentVariantType
  readable: boolean
  apiEvents: DocumentHistoryEvent[]
  isOpen: boolean
  openBaselineRevisionId?: string
  pendingClose: boolean
  activeTransactions: ActiveEditTransaction[]
}

/**
 * Snapshot of a variant's active edit state captured right before an async reload/refetch,
 * used to preserve live edits that arrive while the request is in flight.
 *
 * @internal
 */
export interface PreFetchVariantSnapshot {
  baselineRevisionId?: string
  revisionIds: ReadonlySet<string>
}

interface OpenLifecycleInfo {
  isOpen: boolean
  baselineRevisionId?: string
}

function getEventVersionRevisionId(event: DocumentHistoryEvent): string | undefined {
  if (event.type === 'created' || event.type === 'unpublished') {
    return event.versionRevisionId || undefined
  }
  return undefined
}

function analyzeDraftOpenLifecycle(apiEvents: readonly DocumentHistoryEvent[]): OpenLifecycleInfo {
  const newest = apiEvents[0]
  if (!newest || (newest.type !== 'created' && newest.type !== 'unpublished')) {
    return {isOpen: false}
  }

  let baselineRevisionId: string | undefined
  for (const event of apiEvents) {
    if (event.type !== 'created' && event.type !== 'unpublished') {
      break
    }
    const rev = getEventVersionRevisionId(event)
    if (rev) {
      baselineRevisionId = rev
    }
  }

  return {
    isOpen: true,
    ...(baselineRevisionId ? {baselineRevisionId} : {}),
  }
}

/**
 * Determines whether a variant currently has an open (not-yet-published/discarded) lifecycle
 * and the baseline revision ID that opened it, inspecting `apiEvents` in server newest-first
 * order.
 *
 * @internal
 */
export function analyzeOpenLifecycle(
  apiEvents: readonly DocumentHistoryEvent[],
  variantType: DocumentVariantType,
  readable: boolean,
): OpenLifecycleInfo {
  if (variantType === 'published') return {isOpen: false}
  if (apiEvents.length === 0) return {isOpen: readable}

  if (variantType === 'version') {
    const newest = apiEvents[0]!
    if (newest.type !== 'created') return {isOpen: false}
    const rev = getEventVersionRevisionId(newest)
    return {isOpen: true, ...(rev ? {baselineRevisionId: rev} : {})}
  }

  return analyzeDraftOpenLifecycle(apiEvents)
}

/**
 * Normalizes raw `/events/documents` responses into per-variant {@link VariantTimelineData}
 * records, preserving whether each requested ID was present in `response.events`.
 *
 * @internal
 */
export function normalizeEventsByVariant(
  variantIds: readonly string[],
  eventsByVariant: Record<string, RawDocumentHistoryEvent[]>,
): Record<string, VariantTimelineData> {
  const variants: Record<string, VariantTimelineData> = {}
  for (const variantId of variantIds) {
    const variantType = getDocumentVariantType(variantId)
    const readable = Object.prototype.hasOwnProperty.call(eventsByVariant, variantId)
    const rawEvents = eventsByVariant[variantId] ?? []
    const apiEvents = orderEventsByTimestamp(
      rawEvents.map((ev) => normalizeHistoryEvent(ev, variantId)),
    )
    const lifecycle = analyzeOpenLifecycle(apiEvents, variantType, readable)
    variants[variantId] = {
      variantId,
      variantType,
      readable,
      apiEvents,
      isOpen: lifecycle.isOpen,
      ...(lifecycle.baselineRevisionId
        ? {openBaselineRevisionId: lifecycle.baselineRevisionId}
        : {}),
      pendingClose: false,
      activeTransactions: EMPTY_ACTIVE_TRANSACTIONS,
    }
  }
  return variants
}

/**
 * Collects open variants from an initial `/events/documents` response that need a batched
 * reverse `/transactions` fetch.
 *
 * @internal
 */
export function getActiveTargetsForInitialLoad(
  variants: Record<string, VariantTimelineData>,
): ActiveVariantTransactionsTarget[] {
  const targets: ActiveVariantTransactionsTarget[] = []
  for (const variant of Object.values(variants)) {
    if (!variant.isOpen) continue
    targets.push({
      variantId: variant.variantId,
      ...(variant.openBaselineRevisionId
        ? {baselineRevisionId: variant.openBaselineRevisionId}
        : {}),
    })
  }
  return targets
}

/**
 * Captures pre-fetch active edit revision IDs and baselines before an async reload or refetch.
 *
 * @internal
 */
export function snapshotPreFetchVariants(
  variants: Record<string, VariantTimelineData> | undefined,
): Map<string, PreFetchVariantSnapshot> {
  const snapshots = new Map<string, PreFetchVariantSnapshot>()
  if (!variants) return snapshots
  for (const [variantId, variant] of Object.entries(variants)) {
    snapshots.set(variantId, {
      baselineRevisionId: variant.openBaselineRevisionId,
      revisionIds: new Set(variant.activeTransactions.map((tx) => tx.revisionId)),
    })
  }
  return snapshots
}

function createEmptyVariant(variantId: string): VariantTimelineData {
  return {
    variantId,
    variantType: getDocumentVariantType(variantId),
    readable: false,
    apiEvents: EMPTY_EVENTS,
    isOpen: false,
    pendingClose: false,
    activeTransactions: EMPTY_ACTIVE_TRANSACTIONS,
  }
}

function mergeOrderedApiEvents(
  primary: VariantTimelineData | undefined,
  secondary: VariantTimelineData | undefined,
): DocumentHistoryEvent[] {
  return orderEventsByTimestamp(
    dedupeHistoryEvents(
      primary ? primary.apiEvents : EMPTY_EVENTS,
      secondary ? secondary.apiEvents : EMPTY_EVENTS,
    ),
  )
}

interface ResolvedReloadVariant {
  variantId: string
  variantType: DocumentVariantType
  readable: boolean
  apiEvents: DocumentHistoryEvent[]
  lifecycle: OpenLifecycleInfo
}

function resolveReloadVariantLifecycle(
  variantId: string,
  existing: VariantTimelineData | undefined,
  incoming: VariantTimelineData | undefined,
): ResolvedReloadVariant {
  const base = incoming ?? existing ?? createEmptyVariant(variantId)
  const readable = base.readable || Boolean(existing && existing.readable)
  const apiEvents = mergeOrderedApiEvents(incoming, existing)
  const lifecycle = analyzeOpenLifecycle(apiEvents, base.variantType, readable)
  return {variantId, variantType: base.variantType, readable, apiEvents, lifecycle}
}

function shouldFetchReloadTransactions(
  existing: VariantTimelineData | undefined,
  lifecycle: OpenLifecycleInfo,
  refreshAllActive: boolean,
): boolean {
  if (!lifecycle.isOpen) return false
  if (refreshAllActive) return true
  return !isSameLifecycle(existing, lifecycle.baselineRevisionId)
}

/**
 * Determines which open variants need a `/transactions` fetch during a reload or refetch.
 *
 * On `resync` / manual `refetch` (`refreshAllActive: true`), refreshes every open variant.
 * On normal mutation-triggered reloads, only fetches variants that newly opened or changed
 * baseline so unrelated open siblings do not trigger extra requests.
 *
 * @internal
 */
export function getActiveTargetsForReload(
  existingVariants: Record<string, VariantTimelineData> | undefined,
  reloadVariants: Record<string, VariantTimelineData>,
  variantIds: readonly string[],
  refreshAllActive: boolean,
): ActiveVariantTransactionsTarget[] {
  const targets: ActiveVariantTransactionsTarget[] = []
  for (const variantId of variantIds) {
    const existing = existingVariants?.[variantId]
    const {lifecycle} = resolveReloadVariantLifecycle(
      variantId,
      existing,
      reloadVariants[variantId],
    )
    if (!shouldFetchReloadTransactions(existing, lifecycle, refreshAllActive)) continue
    targets.push({
      variantId,
      ...(lifecycle.baselineRevisionId ? {baselineRevisionId: lifecycle.baselineRevisionId} : {}),
    })
  }
  return targets
}

/**
 * Attaches fetched reverse `/transactions` results onto initial-load variant records.
 *
 * @internal
 */
export function applyFetchedActiveTransactions(
  variants: Record<string, VariantTimelineData>,
  fetchedByVariant: Record<string, ActiveVariantTransactionsResult>,
): Record<string, VariantTimelineData> {
  let changed = false
  const next: Record<string, VariantTimelineData> = {...variants}

  for (const [variantId, fetched] of Object.entries(fetchedByVariant)) {
    const variant = next[variantId]
    if (!variant) continue
    const activeTransactions = extractActiveEditTransactions(fetched.transactions, fetched)
    const openBaselineRevisionId = variant.openBaselineRevisionId ?? fetched.boundaryRevisionId
    next[variantId] = {
      ...variant,
      ...(openBaselineRevisionId ? {openBaselineRevisionId} : {}),
      activeTransactions,
    }
    changed = true
  }

  return changed ? next : variants
}

function mergeInFlightLiveTransactions(
  fetchedTransactions: ActiveEditTransaction[],
  existingTransactions: readonly ActiveEditTransaction[],
  preFetchRevisionIds: ReadonlySet<string>,
): ActiveEditTransaction[] {
  const fetchedIds = new Set(fetchedTransactions.map((tx) => tx.revisionId))
  const inFlight = existingTransactions.filter(
    (tx) => !preFetchRevisionIds.has(tx.revisionId) && !fetchedIds.has(tx.revisionId),
  )
  if (inFlight.length === 0) return fetchedTransactions

  const merged = [...fetchedTransactions]
  for (const tx of inFlight) {
    const previousRevisionId = tx.previousRevisionId ?? merged.at(-1)?.revisionId
    merged.push({
      ...tx,
      ...(previousRevisionId ? {previousRevisionId} : {}),
    })
  }
  return merged
}

function apiEventsContainRevision(
  apiEvents: readonly DocumentHistoryEvent[],
  revisionId: string,
): boolean {
  return apiEvents.some((event) => {
    if ('versionRevisionId' in event && event.versionRevisionId === revisionId) return true
    if ('revisionId' in event && event.revisionId === revisionId) return true
    return false
  })
}

function isSameLifecycle(
  existing: VariantTimelineData | undefined,
  nextBaseline: string | undefined,
): existing is VariantTimelineData {
  if (!existing?.isOpen || existing.pendingClose) return false
  if (!nextBaseline || !existing.openBaselineRevisionId) return true
  return existing.openBaselineRevisionId === nextBaseline
}

function hasInFlightLiveReopen(
  existing: VariantTimelineData | undefined,
  apiEvents: readonly DocumentHistoryEvent[],
  preFetch: PreFetchVariantSnapshot | undefined,
): existing is VariantTimelineData {
  if (!existing?.isOpen || existing.pendingClose) return false
  const baseline = existing.openBaselineRevisionId
  if (!baseline || baseline === preFetch?.baselineRevisionId) return false
  return !apiEventsContainRevision(apiEvents, baseline)
}

function mergeClosedReloadVariant(
  resolved: ResolvedReloadVariant,
  existing: VariantTimelineData | undefined,
  preFetch: PreFetchVariantSnapshot | undefined,
): VariantTimelineData {
  const {variantId, variantType, readable, apiEvents} = resolved
  if (hasInFlightLiveReopen(existing, apiEvents, preFetch)) {
    return {
      variantId,
      variantType,
      readable: true,
      apiEvents,
      isOpen: true,
      openBaselineRevisionId: existing.openBaselineRevisionId,
      pendingClose: false,
      activeTransactions: existing.activeTransactions,
    }
  }

  return {
    variantId,
    variantType,
    readable,
    apiEvents,
    isOpen: false,
    pendingClose: false,
    activeTransactions: EMPTY_ACTIVE_TRANSACTIONS,
  }
}

function mergeFetchedOpenVariant(
  resolved: ResolvedReloadVariant,
  existing: VariantTimelineData | undefined,
  fetched: ActiveVariantTransactionsResult,
  preFetch: PreFetchVariantSnapshot | undefined,
): VariantTimelineData {
  const fetchedTransactions = extractActiveEditTransactions(fetched.transactions, fetched)
  const nextBaseline = resolved.lifecycle.baselineRevisionId ?? fetched.boundaryRevisionId
  const activeTransactions = isSameLifecycle(existing, nextBaseline)
    ? mergeInFlightLiveTransactions(
        fetchedTransactions,
        existing.activeTransactions,
        preFetch?.revisionIds ?? new Set<string>(),
      )
    : fetchedTransactions

  return {
    variantId: resolved.variantId,
    variantType: resolved.variantType,
    readable: resolved.readable,
    apiEvents: resolved.apiEvents,
    isOpen: true,
    ...(nextBaseline ? {openBaselineRevisionId: nextBaseline} : {}),
    pendingClose: false,
    activeTransactions,
  }
}

function preserveOpenVariant(
  resolved: ResolvedReloadVariant,
  existing: VariantTimelineData | undefined,
): VariantTimelineData {
  const sameLifecycle = isSameLifecycle(existing, resolved.lifecycle.baselineRevisionId)
  const nextBaseline =
    resolved.lifecycle.baselineRevisionId ??
    (sameLifecycle ? existing.openBaselineRevisionId : undefined)
  const preservedTransactions = sameLifecycle
    ? existing.activeTransactions.filter((tx) => tx.revisionId !== nextBaseline)
    : EMPTY_ACTIVE_TRANSACTIONS

  return {
    variantId: resolved.variantId,
    variantType: resolved.variantType,
    readable: resolved.readable,
    apiEvents: resolved.apiEvents,
    isOpen: true,
    ...(nextBaseline ? {openBaselineRevisionId: nextBaseline} : {}),
    pendingClose: false,
    activeTransactions: preservedTransactions,
  }
}

/**
 * Merges a reloaded `/events/documents` batch (plus any fetched active transactions) into the
 * current per-variant state while preserving in-flight live edits and clearing closed lifecycles.
 *
 * @internal
 */
export function mergeReloadVariants(
  existingVariants: Record<string, VariantTimelineData>,
  reloadVariants: Record<string, VariantTimelineData>,
  variantIds: readonly string[],
  fetchedActiveByVariant: Record<string, ActiveVariantTransactionsResult> | undefined,
  preFetchSnapshots: Map<string, PreFetchVariantSnapshot>,
): Record<string, VariantTimelineData> {
  const merged: Record<string, VariantTimelineData> = {}
  for (const variantId of variantIds) {
    const existing = existingVariants[variantId]
    const resolved = resolveReloadVariantLifecycle(variantId, existing, reloadVariants[variantId])
    const preFetch = preFetchSnapshots.get(variantId)
    const fetched = fetchedActiveByVariant?.[variantId]

    if (!resolved.lifecycle.isOpen) {
      merged[variantId] = mergeClosedReloadVariant(resolved, existing, preFetch)
    } else if (fetched) {
      merged[variantId] = mergeFetchedOpenVariant(resolved, existing, fetched, preFetch)
    } else {
      merged[variantId] = preserveOpenVariant(resolved, existing)
    }
  }
  return merged
}

function mergeSingleLoadMoreVariant(
  variantId: string,
  existing: VariantTimelineData | undefined,
  older: VariantTimelineData | undefined,
): VariantTimelineData {
  if (!existing) {
    return older ?? createEmptyVariant(variantId)
  }

  return {
    ...existing,
    readable: existing.readable || Boolean(older && older.readable),
    apiEvents: mergeOrderedApiEvents(existing, older),
  }
}

/**
 * Appends an older `loadMore` page onto existing variants without discarding active edit state.
 *
 * @internal
 */
export function mergeLoadMoreVariants(
  existingVariants: Record<string, VariantTimelineData>,
  olderPageVariants: Record<string, VariantTimelineData>,
  variantIds: readonly string[],
): Record<string, VariantTimelineData> {
  const merged: Record<string, VariantTimelineData> = {}
  for (const variantId of variantIds) {
    merged[variantId] = mergeSingleLoadMoreVariant(
      variantId,
      existingVariants[variantId],
      olderPageVariants[variantId],
    )
  }
  return merged
}

function applyLiveAppear(variant: VariantTimelineData, revId: string): VariantTimelineData {
  return {
    ...variant,
    readable: true,
    isOpen: true,
    openBaselineRevisionId: revId || undefined,
    pendingClose: false,
    activeTransactions: EMPTY_ACTIVE_TRANSACTIONS,
  }
}

function applyLiveUpdate(
  variant: VariantTimelineData,
  event: DocumentMutationChangeEvent,
  revId: string,
): VariantTimelineData | undefined {
  if (variant.pendingClose || !revId) return undefined
  if (variant.openBaselineRevisionId === revId) return undefined
  if (variant.activeTransactions.some((tx) => tx.revisionId === revId)) return undefined

  const previousRevisionId =
    event.previousRev ||
    variant.activeTransactions.at(-1)?.revisionId ||
    variant.openBaselineRevisionId

  const nextTx: ActiveEditTransaction = {
    revisionId: revId,
    ...(previousRevisionId ? {previousRevisionId} : {}),
    author: event.identity,
    timestamp: event.timestamp,
  }

  return {
    ...variant,
    readable: true,
    isOpen: true,
    activeTransactions: [...variant.activeTransactions, nextTx],
  }
}

/**
 * Applies a live `DocumentMutationChangeEvent` on a watched draft or release version to its
 * per-variant active edit state without issuing an HTTP request.
 *
 * @internal
 */
export function applyLiveVariantMutationToVariants(
  variants: Record<string, VariantTimelineData>,
  event: DocumentMutationChangeEvent,
): Record<string, VariantTimelineData> {
  const variant = variants[event.documentId]
  if (!variant || variant.variantType === 'published') return variants

  const revId = event.resultRev ?? event.transactionId

  if (event.transition === 'appear') {
    return {...variants, [event.documentId]: applyLiveAppear(variant, revId)}
  }
  if (event.transition === 'disappear') {
    return variant.pendingClose
      ? variants
      : {...variants, [event.documentId]: {...variant, pendingClose: true}}
  }
  if (event.transition !== 'update') return variants

  const updated = applyLiveUpdate(variant, event, revId)
  return updated ? {...variants, [event.documentId]: updated} : variants
}

const variantTimelineCache = new WeakMap<VariantTimelineData, DocumentHistoryEvent[]>()

/**
 * Builds (and WeakMap-caches) the normalized timeline for a single variant by combining its
 * transformed semantic events with any synthesized active edit events.
 *
 * @internal
 */
export function buildVariantTimeline(variant: VariantTimelineData): DocumentHistoryEvent[] {
  const cached = variantTimelineCache.get(variant)
  if (cached) return cached

  const apiTimeline =
    variant.apiEvents.length > 0
      ? applyVariantTransforms(variant.apiEvents, variant.variantType)
      : EMPTY_EVENTS
  const activeEdits =
    variant.activeTransactions.length > 0
      ? synthesizeActiveEditEvents(variant.activeTransactions, variant.variantId)
      : EMPTY_EVENTS

  let timeline: DocumentHistoryEvent[]
  if (activeEdits.length === 0) {
    timeline = apiTimeline
  } else if (apiTimeline.length === 0) {
    timeline = activeEdits
  } else {
    timeline = orderEventsByTimestamp(dedupeHistoryEvents(activeEdits, apiTimeline))
  }

  variantTimelineCache.set(variant, timeline)
  return timeline
}
