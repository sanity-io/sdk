import {type RawDocumentHistoryEvent} from './historyClient'
import {getDocumentVariantType} from './historyOptions'
import {
  type DocumentHistoryBaseEvent,
  type DocumentHistoryCreatedEvent,
  type DocumentHistoryEditedEvent,
  type DocumentHistoryEvent,
  type DocumentHistoryEventType,
  type DocumentVariantType,
} from './types'

const MERGE_WINDOW_MS = 5 * 60 * 1000

const EVENT_SORT_RANK: Record<DocumentHistoryEventType, number> = {
  deleted: 0,
  unpublished: 1,
  published: 2,
  discarded: 3,
  edited: 4,
  created: 5,
}

const RAW_TO_EVENT_TYPE: Record<RawDocumentHistoryEvent['type'], DocumentHistoryEventType> = {
  createLiveDocument: 'created',
  createDocumentVersion: 'created',
  updateLiveDocument: 'edited',
  publishDocumentVersion: 'published',
  unpublishDocument: 'unpublished',
  deleteDocumentVersion: 'discarded',
  deleteDocumentGroup: 'deleted',
}

function isWithinMergeWindow(timestampA: string, timestampB: string): boolean {
  return Math.abs(Date.parse(timestampA) - Date.parse(timestampB)) < MERGE_WINDOW_MS
}

function timestampPrefixed(prefix: string, timestamp: string): string {
  return timestamp ? `${prefix}${timestamp}` : ''
}

type RawEventIdResolver<TType extends RawDocumentHistoryEvent['type']> = (
  event: Extract<RawDocumentHistoryEvent, {type: TType}>,
) => string

const PUBLISHED_ID_RESOLVERS: {
  [K in RawDocumentHistoryEvent['type']]: RawEventIdResolver<K>
} = {
  createLiveDocument: (ev) => ev.revisionId,
  updateLiveDocument: (ev) => ev.revisionId,
  publishDocumentVersion: (ev) => ev.revisionId,
  createDocumentVersion: (ev) =>
    ev.revisionId || timestampPrefixed('publishCreation--', ev.timestamp),
  deleteDocumentVersion: (ev) => timestampPrefixed('deleteAt-', ev.timestamp),
  unpublishDocument: (ev) => timestampPrefixed('unpublishAt-', ev.timestamp),
  deleteDocumentGroup: (ev) => timestampPrefixed('deleted-', ev.timestamp),
}

const VARIANT_ID_RESOLVERS: {
  [K in RawDocumentHistoryEvent['type']]: RawEventIdResolver<K>
} = {
  createLiveDocument: (ev) => ev.revisionId,
  updateLiveDocument: (ev) => ev.revisionId,
  publishDocumentVersion: (ev) => ev.versionRevisionId || ev.revisionId,
  createDocumentVersion: (ev) => ev.versionRevisionId,
  deleteDocumentVersion: (ev) => ev.versionRevisionId,
  unpublishDocument: (ev) =>
    ev.versionRevisionId
      ? `unpublish-${ev.versionRevisionId}`
      : timestampPrefixed('unpublishAt-', ev.timestamp),
  deleteDocumentGroup: (ev) => timestampPrefixed('deleted-', ev.timestamp),
}

type RawEventNormalizer<TType extends RawDocumentHistoryEvent['type']> = (
  event: Extract<RawDocumentHistoryEvent, {type: TType}>,
  base: Omit<DocumentHistoryBaseEvent, 'type'>,
) => DocumentHistoryEvent

const RAW_EVENT_NORMALIZERS: {
  [K in RawDocumentHistoryEvent['type']]: RawEventNormalizer<K>
} = {
  createLiveDocument: (ev, base) => ({...base, type: 'created', revisionId: ev.revisionId}),
  createDocumentVersion: (ev, base) => ({
    ...base,
    type: 'created',
    versionId: ev.versionId,
    versionRevisionId: ev.versionRevisionId,
    ...(ev.revisionId !== undefined ? {revisionId: ev.revisionId} : {}),
    ...(ev.releaseId !== undefined ? {releaseId: ev.releaseId} : {}),
  }),
  updateLiveDocument: (ev, base) => ({
    ...base,
    type: 'edited',
    revisionId: ev.revisionId,
    contributors: ev.author ? [ev.author] : [],
    transactions: [
      {
        type: 'editTransaction',
        author: ev.author,
        timestamp: ev.timestamp,
        revisionId: ev.revisionId,
      },
    ],
  }),
  publishDocumentVersion: (ev, base) => ({
    ...base,
    type: 'published',
    revisionId: ev.revisionId,
    versionId: ev.versionId,
    publishCause: ev.publishCause,
    ...(ev.versionRevisionId !== undefined ? {versionRevisionId: ev.versionRevisionId} : {}),
    ...(ev.releaseId !== undefined ? {releaseId: ev.releaseId} : {}),
    ...(ev.contributors !== undefined ? {contributors: ev.contributors} : {}),
  }),
  unpublishDocument: (ev, base) => ({
    ...base,
    type: 'unpublished',
    versionId: ev.versionId,
    versionRevisionId: ev.versionRevisionId,
    ...(ev.releaseId !== undefined ? {releaseId: ev.releaseId} : {}),
  }),
  deleteDocumentVersion: (ev, base) => ({
    ...base,
    type: 'discarded',
    versionId: ev.versionId,
    versionRevisionId: ev.versionRevisionId,
    ...(ev.releaseId !== undefined ? {releaseId: ev.releaseId} : {}),
  }),
  deleteDocumentGroup: (_ev, base) => ({...base, type: 'deleted'}),
}

function resolveRawEventId(
  rawEvent: RawDocumentHistoryEvent,
  variantType: DocumentVariantType,
): string {
  const table = variantType === 'published' ? PUBLISHED_ID_RESOLVERS : VARIANT_ID_RESOLVERS
  const resolver = table[rawEvent.type] as (event: RawDocumentHistoryEvent) => string
  return resolver(rawEvent)
}

/**
 * Normalizes a raw Content Lake History API event into a {@link DocumentHistoryEvent} with a
 * deterministic, variant-namespaced `id` (`${variantId}:${localId}`), `variantId`, and
 * `documentVariantType`. Never produces an empty string `id`.
 *
 * @internal
 */
export function normalizeHistoryEvent(
  rawEvent: RawDocumentHistoryEvent,
  variantId: string,
): DocumentHistoryEvent {
  const variantType = getDocumentVariantType(variantId)
  const localId =
    resolveRawEventId(rawEvent, variantType) ||
    `${RAW_TO_EVENT_TYPE[rawEvent.type]}:${rawEvent.timestamp || 'unknown'}`
  const base: Omit<DocumentHistoryBaseEvent, 'type'> = {
    id: `${variantId}:${localId}`,
    author: rawEvent.author,
    timestamp: rawEvent.timestamp,
    documentId: rawEvent.documentId,
    variantId,
    documentVariantType: variantType,
  }
  const normalize = RAW_EVENT_NORMALIZERS[rawEvent.type] as (
    event: RawDocumentHistoryEvent,
    baseEvent: Omit<DocumentHistoryBaseEvent, 'type'>,
  ) => DocumentHistoryEvent
  return normalize(rawEvent, base)
}

/**
 * Merges two event arrays while removing duplicates by `id`.
 *
 * Semantic lifecycle events replace edit events that share the same ID, and distinct lifecycle
 * event types sharing an ID receive disambiguated IDs so neither is dropped.
 *
 * @internal
 */
export function dedupeHistoryEvents(
  existing: DocumentHistoryEvent[],
  incoming: DocumentHistoryEvent[],
): DocumentHistoryEvent[] {
  const byId = new Map<string, DocumentHistoryEvent>()
  for (const event of [...existing, ...incoming]) {
    const current = byId.get(event.id)
    if (!current) {
      byId.set(event.id, event)
      continue
    }
    if (current.type === 'edited' && event.type !== 'edited') {
      byId.set(event.id, event)
      continue
    }
    if (current.type !== 'edited' && event.type === 'edited') {
      continue
    }
    if (current.type !== event.type) {
      const disambiguatedId = `${event.type}:${event.id}`
      if (!byId.has(disambiguatedId)) {
        byId.set(disambiguatedId, {...event, id: disambiguatedId})
      }
    }
  }
  return Array.from(byId.values())
}

function compareHistoryEvents(a: DocumentHistoryEvent, b: DocumentHistoryEvent): number {
  const timeDiff = Date.parse(b.timestamp) - Date.parse(a.timestamp)
  if (timeDiff !== 0) return timeDiff
  const rankDiff = EVENT_SORT_RANK[a.type] - EVENT_SORT_RANK[b.type]
  if (rankDiff !== 0) return rankDiff
  return a.id.localeCompare(b.id)
}

/**
 * Sorts history events newest-first by timestamp only, preserving relative input order for events
 * sharing the same timestamp (for example, whole-second server events from `/events/documents`).
 *
 * @internal
 */
export function orderEventsByTimestamp(events: DocumentHistoryEvent[]): DocumentHistoryEvent[] {
  return [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
}

/**
 * Sorts history events newest-first using a strictly transitive comparator.
 *
 * @internal
 */
export function sortHistoryEvents(events: DocumentHistoryEvent[]): DocumentHistoryEvent[] {
  return [...events].sort(compareHistoryEvents)
}

function isLifecycleBoundary(event: DocumentHistoryEvent): boolean {
  return (
    event.type === 'published' ||
    event.type === 'discarded' ||
    event.type === 'unpublished' ||
    event.type === 'deleted'
  )
}

function consumeDraftLifecycleAt(
  events: DocumentHistoryEvent[],
  index: number,
  consumed: Set<number>,
): DocumentHistoryEvent {
  const current = events[index]!
  if (current.type !== 'published' && current.type !== 'discarded') {
    return current
  }

  let creationEvent: DocumentHistoryCreatedEvent | undefined
  for (let j = index + 1; j < events.length; j++) {
    const older = events[j]!
    if (older.type === 'created') {
      creationEvent = older
      consumed.add(j)
      break
    }
    if (isLifecycleBoundary(older)) {
      break
    }
  }

  return creationEvent ? {...current, creationEvent} : current
}

function foldDraftLifecycles(events: DocumentHistoryEvent[]): DocumentHistoryEvent[] {
  const consumed = new Set<number>()
  const result: DocumentHistoryEvent[] = []
  for (let i = 0; i < events.length; i++) {
    if (consumed.has(i)) continue
    result.push(consumeDraftLifecycleAt(events, i, consumed))
  }
  return result
}

function isSquashableLiveEditPair(
  previous: DocumentHistoryEvent | undefined,
  current: DocumentHistoryEvent,
): previous is DocumentHistoryEditedEvent {
  return Boolean(
    previous &&
    previous.type === 'edited' &&
    previous.documentVariantType === 'published' &&
    current.type === 'edited' &&
    current.documentVariantType === 'published' &&
    previous.author === current.author &&
    isWithinMergeWindow(previous.timestamp, current.timestamp),
  )
}

function squashLiveEditEvents(events: DocumentHistoryEvent[]): DocumentHistoryEvent[] {
  const result: DocumentHistoryEvent[] = []
  for (const event of events) {
    const previous = result.at(-1)
    if (isSquashableLiveEditPair(previous, event) && event.type === 'edited') {
      result[result.length - 1] = {
        ...previous,
        transactions: [...previous.transactions, ...event.transactions],
      }
      continue
    }
    result.push(event)
  }
  return result
}

/**
 * Applies single-variant post-processing without mutating input events:
 * - stamps `documentVariantType`
 * - folds completed draft publish/discard lifecycles onto their parent event via `creationEvent`
 * - squashes consecutive same-author published `edited` events within 5 minutes
 *
 * Must be called per `variantId` before merging timelines across documents.
 *
 * @internal
 */
export function applyVariantTransforms(
  events: DocumentHistoryEvent[],
  variantType: DocumentVariantType,
): DocumentHistoryEvent[] {
  const stamped = events.map((event) =>
    event.documentVariantType === variantType
      ? event
      : {...event, documentVariantType: variantType},
  )

  const transformed = variantType !== 'published' ? foldDraftLifecycles(stamped) : stamped
  return squashLiveEditEvents(transformed)
}

/**
 * Merges already-ordered per-variant timelines into a single newest-first stream via k-way merge.
 * Preserves each variant's intra-variant sequence order for equal-timestamp events while using
 * deterministic tie-breaking across distinct variants.
 *
 * @internal
 */
export function mergeVariantTimelines(
  timelines: readonly DocumentHistoryEvent[][],
): DocumentHistoryEvent[] {
  const nonEmpty = timelines.filter((timeline) => timeline.length > 0)
  if (nonEmpty.length === 0) return []
  if (nonEmpty.length === 1) return nonEmpty[0]!

  const cursors = nonEmpty.map(() => 0)
  const merged: DocumentHistoryEvent[] = []

  while (true) {
    let bestIndex = -1
    let bestEvent: DocumentHistoryEvent | undefined

    for (let i = 0; i < nonEmpty.length; i++) {
      const candidate = nonEmpty[i]![cursors[i]!]
      if (!candidate) continue
      if (!bestEvent || compareHistoryEvents(candidate, bestEvent) < 0) {
        bestEvent = candidate
        bestIndex = i
      }
    }

    if (bestIndex === -1 || !bestEvent) break
    merged.push(bestEvent)
    cursors[bestIndex]! += 1
  }

  return merged
}
