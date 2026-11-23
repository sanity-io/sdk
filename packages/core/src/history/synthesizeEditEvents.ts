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

function groupEditTransactions(
  transactions: DocumentHistoryEditTransaction[],
  variantId: string,
  previousRevisionByTxId: ReadonlyMap<string, string>,
): DocumentHistoryEditedEvent[] {
  const variantType = getDocumentVariantType(variantId)
  const documentId = getPublishedId(DocumentId(variantId))
  const newestFirst = [...transactions].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  )
  const groups: DocumentHistoryEditedEvent[] = []

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
      id: `${variantId}:${transaction.revisionId}`,
      type: 'edited',
      documentId,
      variantId,
      documentVariantType: variantType,
      author: transaction.author,
      timestamp: transaction.timestamp,
      revisionId: transaction.revisionId,
      contributors: [transaction.author],
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
