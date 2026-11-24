import {type SanityClient} from '@sanity/client'
import {type TransactionLogEventWithEffects} from '@sanity/types'
import {defer, EMPTY, expand, map, type Observable, of, reduce} from 'rxjs'

import {getEffectState} from './synthesizeEditEvents'
import {type DocumentHistoryPublishCause} from './types'

/**
 * API version used for Content Lake History API requests.
 *
 * @internal
 */
export const HISTORY_API_VERSION = 'v2025-05-06'

const TRANSLOG_PAGE_LIMIT = 50
const ACTIVE_TRANSLOG_PAGE_LIMIT = 100
const ACTIVE_TRANSLOG_MAX_PAGES = 4

interface RawDocumentHistoryBaseEvent {
  author: string
  timestamp: string
  documentId: string
}

/**
 * Raw semantic event returned by `/events/documents/<ids>` before normalization to
 * {@link DocumentHistoryEvent}.
 *
 * @internal
 */
export type RawDocumentHistoryEvent =
  | (RawDocumentHistoryBaseEvent & {
      type: 'createLiveDocument'
      revisionId: string
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'updateLiveDocument'
      revisionId: string
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'deleteDocumentGroup'
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'createDocumentVersion'
      releaseId?: string
      versionId: string
      versionRevisionId: string
      revisionId?: string
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'deleteDocumentVersion'
      releaseId?: string
      versionId: string
      versionRevisionId: string
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'publishDocumentVersion'
      revisionId: string
      releaseId?: string
      versionId: string
      versionRevisionId?: string
      publishCause: DocumentHistoryPublishCause
      contributors?: string[]
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'unpublishDocument'
      releaseId?: string
      versionId: string
      versionRevisionId: string
    })

interface HistoryEventsApiResponse {
  events?: Record<string, RawDocumentHistoryEvent[] | undefined>
  nextCursor?: string
}

/**
 * Fetches one page of semantic lifecycle events for one or more `variantIds` from Content Lake.
 *
 * @internal
 */
export function fetchDocumentsHistoryEvents(
  client: SanityClient,
  {
    variantIds,
    limit,
    nextCursor,
  }: {
    variantIds: readonly string[]
    limit?: number
    nextCursor?: string
  },
): Observable<{eventsByVariant: Record<string, RawDocumentHistoryEvent[]>; nextCursor: string}> {
  const query: Record<string, string> = {
    ...(limit !== undefined ? {limit: String(limit)} : {}),
    ...(nextCursor ? {nextCursor} : {}),
  }
  const encodedIds = variantIds.map((id) => encodeURIComponent(id)).join(',')

  return client.observable
    .request<HistoryEventsApiResponse>({
      url: client.getDataUrl('history', `events/documents/${encodedIds}`),
      query,
      tag: 'history.events',
    })
    .pipe(
      map((response) => {
        const eventsByVariant: Record<string, RawDocumentHistoryEvent[]> = {}
        for (const [variantId, events] of Object.entries(response.events ?? {})) {
          if (events) {
            eventsByVariant[variantId] = events
          }
        }
        return {
          eventsByVariant,
          nextCursor: response.nextCursor ?? '',
        }
      }),
    )
}

function extractStreamErrorMessage(errorField: unknown): string {
  if (typeof errorField === 'string' && errorField) return errorField
  if (errorField && typeof errorField === 'object') {
    const record = errorField as {description?: string; message?: string; type?: string}
    return record.description || record.message || record.type || 'Transaction stream error'
  }
  return 'Transaction stream error'
}

function parseTransactionRecord(value: unknown): TransactionLogEventWithEffects {
  if (value && typeof value === 'object' && 'error' in value) {
    throw new Error(extractStreamErrorMessage((value as {error: unknown}).error))
  }
  return value as TransactionLogEventWithEffects
}

function parseNdjsonTransactions(
  raw: string | Record<string, unknown> | undefined,
): TransactionLogEventWithEffects[] {
  if (!raw) return []
  if (typeof raw === 'object') {
    return [parseTransactionRecord(raw)]
  }

  const results: TransactionLogEventWithEffects[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    results.push(parseTransactionRecord(JSON.parse(trimmed) as unknown))
  }
  return results
}

interface TransactionPageResult {
  fromCursor?: string
  rawEntries: TransactionLogEventWithEffects[]
  filtered: TransactionLogEventWithEffects[]
}

function fetchTransactionPage(
  client: SanityClient,
  {
    variantId,
    fromTransaction,
    toTransaction,
  }: {
    variantId: string
    fromTransaction?: string
    toTransaction?: string
  },
): Observable<TransactionPageResult> {
  const query: Record<string, string> = {
    excludeContent: 'true',
    includeIdentifiedDocumentsOnly: 'true',
    effectFormat: 'mendoza',
    limit: String(TRANSLOG_PAGE_LIMIT),
    ...(fromTransaction ? {fromTransaction} : {}),
    ...(toTransaction ? {toTransaction} : {}),
  }

  return client.observable
    .request<string | Record<string, unknown> | undefined>({
      url: client.getDataUrl('history', `transactions/${encodeURIComponent(variantId)}`),
      query,
      tag: 'history.transactions',
    })
    .pipe(
      map((raw) => {
        const rawEntries = parseNdjsonTransactions(raw)
        const skipFrom = Boolean(fromTransaction && fromTransaction !== toTransaction)
        const filtered = skipFrom
          ? rawEntries.filter((tx) => tx.id !== fromTransaction)
          : rawEntries
        return {fromCursor: fromTransaction, rawEntries, filtered}
      }),
    )
}

/**
 * Fetches Mendoza-formatted transaction log entries for `variantId`, paginating in 50-item chunks
 * until `toTransaction` (or the end of the log) is reached.
 *
 * @internal
 */
export function fetchDocumentTransactions(
  client: SanityClient,
  {
    variantId,
    fromTransaction,
    toTransaction,
  }: {
    variantId: string
    fromTransaction?: string
    toTransaction?: string
  },
): Observable<TransactionLogEventWithEffects[]> {
  return fetchTransactionPage(client, {variantId, fromTransaction, toTransaction}).pipe(
    expand((page) => {
      if (page.rawEntries.length < TRANSLOG_PAGE_LIMIT) return EMPTY
      const lastRawId = page.rawEntries.at(-1)?.id
      if (!lastRawId || lastRawId === page.fromCursor) return EMPTY
      if (toTransaction && lastRawId === toTransaction) return EMPTY
      return fetchTransactionPage(client, {
        variantId,
        fromTransaction: lastRawId,
        toTransaction,
      })
    }),
    reduce((all, page) => all.concat(page.filtered), [] as TransactionLogEventWithEffects[]),
  )
}

/**
 * Target variant and optional lifecycle baseline for fetching active (unpublished) edits.
 *
 * @internal
 */
export interface ActiveVariantTransactionsTarget {
  variantId: string
  baselineRevisionId?: string
}

/**
 * Chronologically ordered active `'modified'` transactions for a single open variant.
 *
 * @internal
 */
export interface ActiveVariantTransactionsResult {
  transactions: TransactionLogEventWithEffects[]
  boundaryRevisionId?: string
  truncated: boolean
}

interface ReverseTransactionPageResult {
  pageIndex: number
  toCursor?: string
  rawEntries: TransactionLogEventWithEffects[]
}

function fetchReverseTransactionPage(
  client: SanityClient,
  variantIds: readonly string[],
  pageIndex: number,
  toTransaction?: string,
): Observable<ReverseTransactionPageResult> {
  const encodedIds = variantIds.map((id) => encodeURIComponent(id)).join(',')
  const query: Record<string, string> = {
    excludeContent: 'true',
    excludeMutations: 'true',
    includeIdentifiedDocumentsOnly: 'true',
    effectFormat: 'mendoza',
    reverse: 'true',
    limit: String(ACTIVE_TRANSLOG_PAGE_LIMIT),
    ...(toTransaction ? {toTransaction, toInclusive: 'false'} : {}),
  }

  return client.observable
    .request<string | Record<string, unknown> | undefined>({
      url: client.getDataUrl('history', `transactions/${encodedIds}`),
      query,
      tag: 'history.transactions',
    })
    .pipe(
      map((raw) => ({
        pageIndex,
        toCursor: toTransaction,
        rawEntries: parseNdjsonTransactions(raw),
      })),
    )
}

function processReverseTransaction(
  tx: TransactionLogEventWithEffects,
  remaining: Map<string, string | undefined>,
  collected: Map<string, TransactionLogEventWithEffects[]>,
  boundaryByVariant: Map<string, string>,
): void {
  for (const [variantId, baselineRevisionId] of Array.from(remaining.entries())) {
    const effect = tx.effects?.[variantId]
    if (!effect) continue

    const effectState = getEffectState(effect)
    if ((baselineRevisionId && tx.id === baselineRevisionId) || effectState === 'created') {
      boundaryByVariant.set(variantId, tx.id)
      remaining.delete(variantId)
      continue
    }
    if (effectState === 'deleted') {
      remaining.delete(variantId)
      continue
    }
    if (effectState === 'modified') {
      collected.get(variantId)?.push(tx)
    }
  }
}

function buildActiveTransactionsResult(
  targets: readonly ActiveVariantTransactionsTarget[],
  collected: Map<string, TransactionLogEventWithEffects[]>,
  boundaryByVariant: Map<string, string>,
  remaining: Map<string, string | undefined>,
  hitPageCap: boolean,
): Record<string, ActiveVariantTransactionsResult> {
  const results: Record<string, ActiveVariantTransactionsResult> = {}
  for (const {variantId} of targets) {
    const boundaryRevisionId = boundaryByVariant.get(variantId)
    results[variantId] = {
      transactions: [...(collected.get(variantId) ?? [])].reverse(),
      ...(boundaryRevisionId ? {boundaryRevisionId} : {}),
      truncated: hitPageCap && remaining.has(variantId),
    }
  }
  return results
}

interface ReverseScanState {
  remaining: Map<string, string | undefined>
  collected: Map<string, TransactionLogEventWithEffects[]>
  boundaryByVariant: Map<string, string>
  hitPageCap: boolean
}

function ingestReversePage(page: ReverseTransactionPageResult, scan: ReverseScanState): void {
  for (const tx of page.rawEntries) {
    if (page.toCursor && tx.id === page.toCursor) continue
    processReverseTransaction(tx, scan.remaining, scan.collected, scan.boundaryByVariant)
  }
}

function advanceReverseScan(
  client: SanityClient,
  page: ReverseTransactionPageResult,
  scan: ReverseScanState,
): Observable<ReverseTransactionPageResult> {
  ingestReversePage(page, scan)

  if (scan.remaining.size === 0 || page.rawEntries.length < ACTIVE_TRANSLOG_PAGE_LIMIT) {
    return EMPTY
  }
  const oldestId = page.rawEntries.at(-1)?.id
  if (!oldestId || oldestId === page.toCursor) {
    return EMPTY
  }
  if (page.pageIndex + 1 >= ACTIVE_TRANSLOG_MAX_PAGES) {
    scan.hitPageCap = true
    return EMPTY
  }

  return fetchReverseTransactionPage(
    client,
    Array.from(scan.remaining.keys()),
    page.pageIndex + 1,
    oldestId,
  )
}

/**
 * Fetches recent Mendoza-formatted `'modified'` transactions in reverse chronological order for
 * one or more open draft/version variants in a single batched stream, stopping per variant as
 * soon as its baseline revision or a `'created'`/`'deleted'` effect is reached (bounded by a
 * page cap).
 *
 * @internal
 */
export function fetchActiveVariantTransactions(
  client: SanityClient,
  targets: readonly ActiveVariantTransactionsTarget[],
): Observable<Record<string, ActiveVariantTransactionsResult>> {
  if (targets.length === 0) {
    return of({})
  }

  return defer(() => {
    const scan: ReverseScanState = {
      remaining: new Map(targets.map((target) => [target.variantId, target.baselineRevisionId])),
      collected: new Map(targets.map((target) => [target.variantId, []])),
      boundaryByVariant: new Map(),
      hitPageCap: false,
    }

    return fetchReverseTransactionPage(client, Array.from(scan.remaining.keys()), 0).pipe(
      expand((page) => advanceReverseScan(client, page, scan)),
      reduce(() => undefined, undefined),
      map(() =>
        buildActiveTransactionsResult(
          targets,
          scan.collected,
          scan.boundaryByVariant,
          scan.remaining,
          scan.hitPageCap,
        ),
      ),
    )
  })
}
