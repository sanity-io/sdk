import {
  type MendozaEffectPair,
  type MendozaPatch,
  type TransactionLogEventWithEffects,
} from '@sanity/types'

import {type RawDocumentHistoryEvent} from './historyClient'
import {getDocumentVariantType} from './historyOptions'
import {
  type DocumentHistoryEditTransaction,
  type DocumentHistoryEvent,
  type DocumentHistoryEventType,
  type DocumentVariantType,
  type EditDocumentVersionHistoryEvent,
  type HistoryClearedEvent,
  isCreateDocumentVersionHistoryEvent,
  isDeleteDocumentGroupHistoryEvent,
  isDeleteDocumentVersionHistoryEvent,
  isEditDocumentVersionHistoryEvent,
  isPublishDocumentVersionHistoryEvent,
  isUnpublishDocumentHistoryEvent,
  isUpdateLiveDocumentHistoryEvent,
} from './types'

/**
 * Fixed ID assigned to synthetic `historyCleared` events.
 *
 * @internal
 */
export const HISTORY_CLEARED_EVENT_ID = 'history-cleared'

const MERGE_WINDOW_MS = 5 * 60 * 1000

const EVENT_SORT_RANK: Record<DocumentHistoryEventType, number> = {
  deleteDocumentGroup: 0,
  unpublishDocument: 1,
  publishDocumentVersion: 2,
  deleteDocumentVersion: 3,
  updateLiveDocument: 4,
  editDocumentVersion: 5,
  createDocumentVersion: 6,
  createLiveDocument: 7,
  historyCleared: 8,
}

function isWithinMergeWindow(timestampA: string, timestampB: string): boolean {
  return Math.abs(Date.parse(timestampA) - Date.parse(timestampB)) < MERGE_WINDOW_MS
}

function isDeletePatch(patch: MendozaPatch): boolean {
  return patch[0] === 0 && patch[1] === null
}

/**
 * Classifies a Mendoza effect pair into what the transaction did to the document.
 *
 * @internal
 */
export function getEffectState(
  effect?: MendozaEffectPair,
): 'noop' | 'deleted' | 'modified' | 'created' {
  if (!effect) return 'noop'
  if (isDeletePatch(effect.apply)) return 'deleted'
  if (isDeletePatch(effect.revert)) return 'created'
  return 'modified'
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
    ev.versionRevisionId || timestampPrefixed('unpublishAt-', ev.timestamp),
  deleteDocumentGroup: (ev) => timestampPrefixed('deleted-', ev.timestamp),
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
 * Assigns a deterministic, collision-free `id` and `documentVariantType` to a raw History API
 * event. Never produces an empty string `id`.
 *
 * @internal
 */
export function assignEventId(
  rawEvent: RawDocumentHistoryEvent,
  variantType: DocumentVariantType,
): DocumentHistoryEvent {
  const candidate = resolveRawEventId(rawEvent, variantType)
  const id = candidate || `${rawEvent.type}:${rawEvent.timestamp || 'unknown'}`
  return {...rawEvent, id, documentVariantType: variantType}
}

/**
 * Merges two event arrays while removing duplicates by `id`.
 *
 * Semantic lifecycle events replace synthesized edit events that share the same revision ID, and
 * distinct lifecycle event types sharing a revision ID receive disambiguated IDs so neither is
 * dropped.
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
    if (isEditDocumentVersionHistoryEvent(current) && !isEditDocumentVersionHistoryEvent(event)) {
      byId.set(event.id, event)
      continue
    }
    if (!isEditDocumentVersionHistoryEvent(current) && isEditDocumentVersionHistoryEvent(event)) {
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

/**
 * Groups edit transactions into 5-minute merged `editDocumentVersion` events anchored to each
 * group's newest transaction.
 *
 * @internal
 */
export function groupEditTransactions(
  transactions: DocumentHistoryEditTransaction[],
  variantId: string,
): EditDocumentVersionHistoryEvent[] {
  const variantType = getDocumentVariantType(variantId)
  const newestFirst = [...transactions].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  )
  const groups: EditDocumentVersionHistoryEvent[] = []

  for (const transaction of newestFirst) {
    const lastGroup = groups.at(-1)
    if (lastGroup && isWithinMergeWindow(lastGroup.timestamp, transaction.timestamp)) {
      lastGroup.transactions.push(transaction)
      if (!lastGroup.contributors.includes(transaction.author)) {
        lastGroup.contributors.push(transaction.author)
      }
      continue
    }

    groups.push({
      id: transaction.revisionId,
      type: 'editDocumentVersion',
      documentId: variantId,
      documentVariantType: variantType,
      author: transaction.author,
      timestamp: transaction.timestamp,
      revisionId: transaction.revisionId,
      contributors: [transaction.author],
      transactions: [transaction],
    })
  }

  return groups
}

/**
 * Synthesizes `editDocumentVersion` events from Mendoza transaction log entries that modified
 * `variantId`.
 *
 * @internal
 */
export function getEditEvents(
  transactions: TransactionLogEventWithEffects[],
  variantId: string,
): EditDocumentVersionHistoryEvent[] {
  const editTransactions: DocumentHistoryEditTransaction[] = []
  for (const tx of transactions) {
    if (getEffectState(tx.effects[variantId]) !== 'modified') continue
    editTransactions.push({
      type: 'editTransaction',
      author: tx.author,
      timestamp: tx.timestamp,
      revisionId: tx.id,
    })
  }
  return groupEditTransactions(editTransactions, variantId)
}

function regroupEditRun(run: EditDocumentVersionHistoryEvent[]): EditDocumentVersionHistoryEvent[] {
  if (run.length <= 1) return run
  const seen = new Set<string>()
  const transactions: DocumentHistoryEditTransaction[] = []
  for (const event of run) {
    for (const tx of event.transactions) {
      if (seen.has(tx.revisionId)) continue
      seen.add(tx.revisionId)
      transactions.push(tx)
    }
  }
  return groupEditTransactions(transactions, run[0]!.documentId)
}

/**
 * Regroups runs of consecutive non-expanded `editDocumentVersion` events (deduplicating
 * transactions by `revisionId`), leaving expanded child edits (`parentId` set) untouched.
 *
 * @internal
 */
export function mergeEditEvents(events: DocumentHistoryEvent[]): DocumentHistoryEvent[] {
  const result: DocumentHistoryEvent[] = []
  let run: EditDocumentVersionHistoryEvent[] = []

  for (const event of events) {
    if (isEditDocumentVersionHistoryEvent(event) && !event.parentId) {
      run.push(event)
      continue
    }
    if (run.length > 0) {
      result.push(...regroupEditRun(run))
      run = []
    }
    result.push(event)
  }

  if (run.length > 0) {
    result.push(...regroupEditRun(run))
  }
  return result
}

/**
 * Finds the baseline `versionRevisionId` from which edit transactions should be synthesized:
 * the creation event for `'version'` timelines, or the newest non-delete revision-bearing event
 * for `'draft'` timelines.
 *
 * @internal
 */
export function findEditEventsBaseline(
  events: DocumentHistoryEvent[],
  variantType: DocumentVariantType,
): string | undefined {
  if (variantType === 'version') {
    return events.find(isCreateDocumentVersionHistoryEvent)?.versionRevisionId
  }

  for (const event of events) {
    if (isDeleteDocumentVersionHistoryEvent(event) || isDeleteDocumentGroupHistoryEvent(event)) {
      continue
    }
    if ('versionRevisionId' in event && event.versionRevisionId) {
      return event.versionRevisionId
    }
  }
  return undefined
}

/**
 * Prepends a synthetic `historyCleared` event timestamped 1ms before the oldest edit event when
 * semantic API events are empty while edit events exist.
 *
 * @internal
 */
export function withHistoryClearedEvent(
  editEvents: (EditDocumentVersionHistoryEvent | HistoryClearedEvent)[],
  {
    apiEvents,
    variantId,
    variantType,
  }: {
    apiEvents: DocumentHistoryEvent[]
    variantId: string
    variantType: DocumentVariantType
  },
): (EditDocumentVersionHistoryEvent | HistoryClearedEvent)[] {
  if (apiEvents.length > 0 || editEvents.length === 0) {
    return editEvents
  }

  const oldestEdit = editEvents.at(-1)!
  const clearedTimestamp = new Date(Date.parse(oldestEdit.timestamp) - 1).toISOString()
  return [
    {
      id: HISTORY_CLEARED_EVENT_ID,
      type: 'historyCleared',
      documentId: variantId,
      documentVariantType: variantType,
      author: '',
      timestamp: clearedTimestamp,
    },
    ...editEvents,
  ]
}

/**
 * Sorts history events newest-first using a strictly transitive comparator, then places any
 * `publishDocumentVersion` immediately before its paired `editDocumentVersion` when second-level
 * API timestamps trail millisecond-level transaction timestamps.
 *
 * @internal
 */
export function sortHistoryEvents(events: DocumentHistoryEvent[]): DocumentHistoryEvent[] {
  const sorted = [...events].sort((a, b) => {
    const timeDiff = Date.parse(b.timestamp) - Date.parse(a.timestamp)
    if (timeDiff !== 0) return timeDiff
    const rankDiff = EVENT_SORT_RANK[a.type] - EVENT_SORT_RANK[b.type]
    if (rankDiff !== 0) return rankDiff
    return a.id.localeCompare(b.id)
  })

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i]!
    if (!isPublishDocumentVersionHistoryEvent(event) || !event.versionRevisionId) continue

    const editIndex = sorted.findIndex(
      (candidate, idx) =>
        idx < i &&
        isEditDocumentVersionHistoryEvent(candidate) &&
        candidate.revisionId === event.versionRevisionId,
    )
    if (editIndex !== -1) {
      sorted.splice(i, 1)
      sorted.splice(editIndex, 0, event)
    }
  }

  return sorted
}

function disambiguateExpandedEditId(event: DocumentHistoryEvent): DocumentHistoryEvent {
  if (!isEditDocumentVersionHistoryEvent(event) || event.parentId !== event.id) {
    return event
  }
  const nextId = event.transactions[1]?.revisionId ?? `edit:${event.id}`
  return {...event, id: nextId}
}

function isLifecycleBoundary(event: DocumentHistoryEvent): boolean {
  return (
    isPublishDocumentVersionHistoryEvent(event) ||
    isDeleteDocumentVersionHistoryEvent(event) ||
    isUnpublishDocumentHistoryEvent(event) ||
    isDeleteDocumentGroupHistoryEvent(event)
  )
}

function linkDraftLifecycleAt(cloned: DocumentHistoryEvent[], index: number): void {
  const current = cloned[index]!
  if (
    !isPublishDocumentVersionHistoryEvent(current) &&
    !isDeleteDocumentVersionHistoryEvent(current)
  ) {
    return
  }

  const parent = {...current, documentId: current.versionId}
  cloned[index] = parent

  for (let j = index + 1; j < cloned.length; j++) {
    const older = cloned[j]!
    if (isEditDocumentVersionHistoryEvent(older)) {
      cloned[j] = {...older, parentId: parent.id}
      continue
    }
    if (isCreateDocumentVersionHistoryEvent(older)) {
      const linkedCreate = {...older, parentId: parent.id}
      cloned[j] = linkedCreate
      parent.creationEvent = linkedCreate
      break
    }
    if (isLifecycleBoundary(older)) {
      break
    }
  }
}

function linkDraftParentEvents(events: DocumentHistoryEvent[]): DocumentHistoryEvent[] {
  const cloned = [...events]
  for (let i = 0; i < cloned.length; i++) {
    linkDraftLifecycleAt(cloned, i)
  }
  return cloned.map(disambiguateExpandedEditId)
}

function squashLiveEditEvents(events: DocumentHistoryEvent[]): DocumentHistoryEvent[] {
  const result: DocumentHistoryEvent[] = []
  for (const event of events) {
    const previous = result.at(-1)
    if (
      isUpdateLiveDocumentHistoryEvent(event) &&
      previous &&
      isUpdateLiveDocumentHistoryEvent(previous) &&
      previous.author === event.author &&
      isWithinMergeWindow(previous.timestamp, event.timestamp)
    ) {
      continue
    }
    result.push(event)
  }
  return result
}

/**
 * Applies variant-specific post-processing without mutating input events:
 * - stamps `documentVariantType`
 * - links draft publish/delete events to their child edits and creation event
 * - rewrites version publish `documentId` to `versionId`
 * - squashes consecutive same-author `updateLiveDocument` events within 5 minutes
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

  let transformed: DocumentHistoryEvent[]
  if (variantType === 'draft') {
    transformed = linkDraftParentEvents(stamped)
  } else if (variantType === 'version') {
    transformed = stamped.map((event) =>
      isPublishDocumentVersionHistoryEvent(event)
        ? {...event, documentId: event.versionId}
        : disambiguateExpandedEditId(event),
    )
  } else {
    transformed = stamped.map(disambiguateExpandedEditId)
  }

  return squashLiveEditEvents(transformed)
}
