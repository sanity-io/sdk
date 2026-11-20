import {type SanityClient} from '@sanity/client'
import {type TransactionLogEventWithEffects} from '@sanity/types'
import {EMPTY, expand, map, type Observable, reduce} from 'rxjs'

import {
  type CreateDocumentVersionHistoryEvent,
  type CreateLiveDocumentHistoryEvent,
  type DeleteDocumentGroupHistoryEvent,
  type DeleteDocumentVersionHistoryEvent,
  type PublishDocumentVersionHistoryEvent,
  type UnpublishDocumentHistoryEvent,
  type UpdateLiveDocumentHistoryEvent,
} from './types'

/**
 * API version used for Content Lake History API requests.
 *
 * @internal
 */
export const HISTORY_API_VERSION = 'v2025-05-06'

const TRANSLOG_PAGE_LIMIT = 50

/**
 * Raw semantic event returned by `/events/documents/<id>` before client-side ID and variant
 * metadata are stamped.
 *
 * @internal
 */
export type RawDocumentHistoryEvent =
  | Omit<CreateLiveDocumentHistoryEvent, 'id' | 'documentVariantType'>
  | Omit<UpdateLiveDocumentHistoryEvent, 'id' | 'documentVariantType'>
  | Omit<DeleteDocumentGroupHistoryEvent, 'id' | 'documentVariantType'>
  | Omit<CreateDocumentVersionHistoryEvent, 'id' | 'documentVariantType' | 'parentId'>
  | Omit<DeleteDocumentVersionHistoryEvent, 'id' | 'documentVariantType' | 'creationEvent'>
  | Omit<PublishDocumentVersionHistoryEvent, 'id' | 'documentVariantType' | 'creationEvent'>
  | Omit<UnpublishDocumentHistoryEvent, 'id' | 'documentVariantType'>

interface HistoryEventsApiResponse {
  events?: Record<string, RawDocumentHistoryEvent[] | undefined>
  nextCursor?: string
}

/**
 * Fetches one page of semantic lifecycle events for `variantId` from Content Lake.
 *
 * @internal
 */
export function fetchDocumentHistoryEvents(
  client: SanityClient,
  {
    variantId,
    limit,
    nextCursor,
  }: {
    variantId: string
    limit?: number
    nextCursor?: string
  },
): Observable<{events: RawDocumentHistoryEvent[]; nextCursor: string}> {
  const query: Record<string, string> = {
    ...(limit !== undefined ? {limit: String(limit)} : {}),
    ...(nextCursor ? {nextCursor} : {}),
  }

  return client.observable
    .request<HistoryEventsApiResponse>({
      url: client.getDataUrl('history', `events/documents/${encodeURIComponent(variantId)}`),
      query,
      tag: 'history.events',
    })
    .pipe(
      map((response) => ({
        events: response.events?.[variantId] ?? [],
        nextCursor: response.nextCursor ?? '',
      })),
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
