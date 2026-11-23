import {DocumentId, isVersionId} from '@sanity/id-utils'
import {type TransactionLogEventWithEffects} from '@sanity/types'
import {map} from 'rxjs'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type Fetcher, type FetcherSnapshot} from '../store/fetcherStore'
import {
  documentTransactionRange,
  type DocumentTransactionRangeOptions,
} from './documentTransactions'
import {getDocumentVariantType} from './historyOptions'
import {getEditEvents, getEffectState} from './synthesizeEditEvents'
import {
  type DocumentHistoryCreatedEvent,
  type DocumentHistoryEditedEvent,
  type DocumentHistoryEvent,
  type DocumentHistoryEventEditsOptions,
  type ExpandableDocumentHistoryEvent,
} from './types'

type LifecycleEventItem = DocumentHistoryEditedEvent | DocumentHistoryCreatedEvent

/**
 * Type guard checking whether a history event can be expanded to inspect the intermediate edit
 * events of its completed draft or release version lifecycle.
 *
 * Returns `true` for `published` and `discarded` events that carry a `versionRevisionId` and
 * either a paired `creationEvent.versionRevisionId` (drafts) or a release version `versionId`
 * (`versions.<release>.<id>`).
 *
 * @public
 */
export function isExpandableHistoryEvent(
  event: DocumentHistoryEvent | undefined,
): event is ExpandableDocumentHistoryEvent {
  if (!event || (event.type !== 'published' && event.type !== 'discarded')) {
    return false
  }
  if (!event.versionRevisionId) {
    return false
  }
  return Boolean(event.creationEvent?.versionRevisionId || isVersionId(DocumentId(event.versionId)))
}

function toTransactionRangeOptions(
  options: DocumentHistoryEventEditsOptions,
): DocumentTransactionRangeOptions {
  const {event, resource, projectId, dataset} = options
  const eventId = event?.id ?? ''
  if (!isExpandableHistoryEvent(event)) {
    throw new Error(
      `History event "${eventId}" cannot be expanded: expected a published or discarded event with a versionRevisionId and either a creationEvent or a release versionId.`,
    )
  }

  return {
    ...(resource !== undefined ? {resource} : {}),
    ...(projectId !== undefined ? {projectId} : {}),
    ...(dataset !== undefined ? {dataset} : {}),
    variantId: event.versionId,
    ...(event.creationEvent?.versionRevisionId
      ? {fromTransaction: event.creationEvent.versionRevisionId}
      : {}),
    toTransaction: event.versionRevisionId,
  }
}

function resolveLifecycleCreationEvent(
  transactions: TransactionLogEventWithEffects[],
  event: ExpandableDocumentHistoryEvent,
): DocumentHistoryCreatedEvent | undefined {
  if (event.creationEvent) {
    return event.creationEvent
  }

  const createTx = transactions.find(
    (tx) => getEffectState(tx.effects[event.versionId]) === 'created',
  )
  if (!createTx) {
    return undefined
  }

  return {
    id: `${event.versionId}:${createTx.id}`,
    type: 'created',
    author: createTx.author,
    timestamp: createTx.timestamp,
    documentId: event.documentId,
    variantId: event.versionId,
    documentVariantType: getDocumentVariantType(event.versionId),
    versionId: event.versionId,
    versionRevisionId: createTx.id,
    ...(event.releaseId !== undefined ? {releaseId: event.releaseId} : {}),
  }
}

const derivedCache = new WeakMap<
  TransactionLogEventWithEffects[],
  Map<string, LifecycleEventItem[]>
>()

function synthesizeEventEdits(
  transactions: TransactionLogEventWithEffects[],
  event: ExpandableDocumentHistoryEvent,
): LifecycleEventItem[] {
  const cacheKey = `${event.id}:${event.versionId}:${event.creationEvent?.id ?? ''}`
  let byEvent = derivedCache.get(transactions)
  const cached = byEvent?.get(cacheKey)
  if (cached) return cached

  const edits = getEditEvents(transactions, event.versionId, event.creationEvent?.versionRevisionId)
  const creationEvent = resolveLifecycleCreationEvent(transactions, event)
  const items: LifecycleEventItem[] = creationEvent ? [...edits, creationEvent] : edits

  if (!byEvent) {
    byEvent = new Map()
    derivedCache.set(transactions, byEvent)
  }
  byEvent.set(cacheKey, items)
  return items
}

function mapTransactionSnapshot(
  snapshot: FetcherSnapshot<TransactionLogEventWithEffects[]>,
  event: ExpandableDocumentHistoryEvent,
): FetcherSnapshot<LifecycleEventItem[]> {
  if (snapshot.status !== 'success') {
    return snapshot
  }
  return {
    ...snapshot,
    data: synthesizeEventEdits(snapshot.data, event),
  }
}

/**
 * Immutable fetcher for the intermediate `edited` events (and trailing `created` event when
 * available) of a completed `published` or `discarded` draft or release version lifecycle,
 * ordered newest first.
 *
 * Backed by the shared immutable transaction-range cache (`staleTime: Infinity`), so repeated
 * expansions and attributed diffs over the same revision range share one HTTP request.
 *
 * @public
 */
export const documentHistoryEventEdits: Fetcher<
  [options: DocumentHistoryEventEditsOptions],
  LifecycleEventItem[]
> = {
  getState(
    instance: SanityInstance,
    options: DocumentHistoryEventEditsOptions,
  ): StateSource<FetcherSnapshot<LifecycleEventItem[]>> {
    const baseSource = documentTransactionRange.getState(
      instance,
      toTransactionRangeOptions(options),
    )
    let lastRaw: FetcherSnapshot<TransactionLogEventWithEffects[]> | undefined
    let lastMapped: FetcherSnapshot<LifecycleEventItem[]> | undefined

    const toMapped = (
      snapshot: FetcherSnapshot<TransactionLogEventWithEffects[]>,
    ): FetcherSnapshot<LifecycleEventItem[]> => {
      if (snapshot === lastRaw && lastMapped) return lastMapped
      lastRaw = snapshot
      lastMapped = mapTransactionSnapshot(snapshot, options.event)
      return lastMapped
    }

    return {
      subscribe: baseSource.subscribe,
      getCurrent: () => toMapped(baseSource.getCurrent()),
      observable: baseSource.observable.pipe(map(toMapped)),
    }
  },
  resolveState(
    instance: SanityInstance,
    options: DocumentHistoryEventEditsOptions,
  ): Promise<LifecycleEventItem[]> {
    return documentTransactionRange
      .resolveState(instance, toTransactionRangeOptions(options))
      .then((transactions) => synthesizeEventEdits(transactions, options.event))
  },
  refetch(
    instance: SanityInstance,
    options: DocumentHistoryEventEditsOptions,
  ): Promise<LifecycleEventItem[]> {
    return documentTransactionRange
      .refetch(instance, toTransactionRangeOptions(options))
      .then((transactions) => synthesizeEventEdits(transactions, options.event))
  },
  invalidate(instance: SanityInstance, options: DocumentHistoryEventEditsOptions): void {
    documentTransactionRange.invalidate(instance, toTransactionRangeOptions(options))
  },
  invalidateAll(instance: SanityInstance): void {
    documentTransactionRange.invalidateAll(instance)
  },
}
