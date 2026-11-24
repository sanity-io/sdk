import {DocumentId, getPublishedId} from '@sanity/id-utils'
import {
  type MendozaEffectPair,
  type MendozaPatch,
  type TransactionLogEventWithEffects,
} from '@sanity/types'

import {getDocumentVariantType} from './historyOptions'
import {type DocumentHistoryEditedEvent, type DocumentHistoryEditTransaction} from './types'

const MERGE_WINDOW_MS = 5 * 60 * 1000

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

/**
 * An active (in-progress) edit transaction on an open draft or release version, originating
 * either from a reverse `/transactions` fetch or a live listener mutation.
 *
 * @internal
 */
export interface ActiveEditTransaction {
  revisionId: string
  previousRevisionId?: string
  author: string
  timestamp: string
}

function groupEditTransactions(
  transactions: DocumentHistoryEditTransaction[],
  variantId: string,
  previousRevisionByTxId: ReadonlyMap<string, string>,
): DocumentHistoryEditedEvent[] {
  const variantType = getDocumentVariantType(variantId)
  const documentId = getPublishedId(DocumentId(variantId))
  const newestFirst = [...transactions]
    .reverse()
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  const groups: DocumentHistoryEditedEvent[] = []

  for (const transaction of newestFirst) {
    const lastGroup = groups.at(-1)
    if (lastGroup && isWithinMergeWindow(lastGroup.timestamp, transaction.timestamp)) {
      lastGroup.transactions.push(transaction)
      if (transaction.author && !lastGroup.contributors.includes(transaction.author)) {
        lastGroup.contributors.push(transaction.author)
      }
      continue
    }

    groups.push({
      id: `${variantId}:${transaction.revisionId}`,
      type: 'edited',
      documentId,
      variantId,
      documentVariantType: variantType,
      author: transaction.author,
      timestamp: transaction.timestamp,
      revisionId: transaction.revisionId,
      contributors: transaction.author ? [transaction.author] : [],
      transactions: [transaction],
    })
  }

  return groups.map((group) => {
    const oldestTxId = group.transactions.at(-1)?.revisionId
    const previousRevisionId = oldestTxId ? previousRevisionByTxId.get(oldestTxId) : undefined
    return previousRevisionId ? {...group, previousRevisionId} : group
  })
}

/**
 * Converts chronologically ordered active `'modified'` transactions into
 * {@link ActiveEditTransaction} entries with accurate `previousRevisionId` chaining.
 *
 * When a reverse fetch was truncated by the page cap, holds back the oldest fetched transaction
 * as the `previousRevisionId` anchor rather than falsely pointing at the lifecycle baseline.
 *
 * @internal
 */
export function extractActiveEditTransactions(
  transactions: readonly TransactionLogEventWithEffects[],
  {
    boundaryRevisionId,
    truncated,
  }: {
    boundaryRevisionId?: string
    truncated: boolean
  },
): ActiveEditTransaction[] {
  if (transactions.length === 0) return []

  const useOldestAsAnchor = truncated && transactions.length > 1
  const startIndex = useOldestAsAnchor ? 1 : 0
  let lastRevisionId = useOldestAsAnchor
    ? transactions[0]!.id
    : truncated
      ? undefined
      : boundaryRevisionId

  const result: ActiveEditTransaction[] = []
  for (let i = startIndex; i < transactions.length; i++) {
    const tx = transactions[i]!
    result.push({
      revisionId: tx.id,
      ...(lastRevisionId ? {previousRevisionId: lastRevisionId} : {}),
      author: tx.author,
      timestamp: tx.timestamp,
    })
    lastRevisionId = tx.id
  }
  return result
}

/**
 * Groups chronologically ordered {@link ActiveEditTransaction} entries into 5-minute
 * {@link DocumentHistoryEditedEvent} groups ordered newest first.
 *
 * @internal
 */
export function synthesizeActiveEditEvents(
  activeTransactions: readonly ActiveEditTransaction[],
  variantId: string,
): DocumentHistoryEditedEvent[] {
  if (activeTransactions.length === 0) return []

  const seen = new Set<string>()
  const editTransactions: DocumentHistoryEditTransaction[] = []
  const previousRevisionByTxId = new Map<string, string>()

  for (const tx of activeTransactions) {
    if (seen.has(tx.revisionId)) continue
    seen.add(tx.revisionId)
    if (tx.previousRevisionId) {
      previousRevisionByTxId.set(tx.revisionId, tx.previousRevisionId)
    }
    editTransactions.push({
      type: 'editTransaction',
      author: tx.author,
      timestamp: tx.timestamp,
      revisionId: tx.revisionId,
    })
  }

  return groupEditTransactions(editTransactions, variantId, previousRevisionByTxId)
}

/**
 * Synthesizes 5-minute grouped `edited` events from Mendoza transaction log entries that
 * modified `variantId`, annotating each merged group with the `previousRevisionId` immediately
 * preceding its oldest edit transaction when known.
 *
 * @internal
 */
export function getEditEvents(
  transactions: TransactionLogEventWithEffects[],
  variantId: string,
  initialPreviousRevisionId?: string,
): DocumentHistoryEditedEvent[] {
  const chronological = [...transactions].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  )
  const editTransactions: DocumentHistoryEditTransaction[] = []
  const previousRevisionByTxId = new Map<string, string>()
  let lastRevisionId = initialPreviousRevisionId

  for (const tx of chronological) {
    const state = getEffectState(tx.effects[variantId])
    if (state === 'created') {
      lastRevisionId = tx.id
      continue
    }
    if (state === 'deleted') {
      lastRevisionId = undefined
      continue
    }
    if (state !== 'modified') continue

    if (lastRevisionId) {
      previousRevisionByTxId.set(tx.id, lastRevisionId)
    }
    editTransactions.push({
      type: 'editTransaction',
      author: tx.author,
      timestamp: tx.timestamp,
      revisionId: tx.id,
    })
    lastRevisionId = tx.id
  }

  return groupEditTransactions(editTransactions, variantId, previousRevisionByTxId)
}
