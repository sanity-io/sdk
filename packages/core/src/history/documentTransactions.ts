import {type TransactionLogEventWithEffects} from '@sanity/types'
import {first, switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type DatasetHandle} from '../config/sanityConfig'
import {defineFetcher} from '../store/fetcherStore'
import {fetchDocumentTransactions, HISTORY_API_VERSION} from './historyClient'
import {getHistoryResourceKey, resolveHistoryResource} from './historyOptions'

const IMMUTABLE_GC_TIME = 300_000

/**
 * Options for reading a closed immutable transaction range on a document variant.
 *
 * @internal
 */
export interface DocumentTransactionRangeOptions extends DatasetHandle {
  variantId: string
  fromTransaction?: string
  toTransaction: string
}

/**
 * Shared immutable fetcher for a closed Mendoza transaction range
 * `[fromTransaction .. toTransaction]` on a document variant.
 *
 * @internal
 */
export const documentTransactionRange = defineFetcher<
  [options: DocumentTransactionRangeOptions],
  TransactionLogEventWithEffects[]
>({
  name: 'document-history-transactions',
  staleTime: Infinity,
  gcTime: IMMUTABLE_GC_TIME,
  refetchOnWindowFocus: false,
  getKey: (instance, options) => {
    const resource = resolveHistoryResource(instance, options)
    return JSON.stringify([
      getHistoryResourceKey(resource),
      options.variantId,
      options.fromTransaction ?? '',
      options.toTransaction,
    ])
  },
  fetch: (instance) => (options) => {
    const resource = resolveHistoryResource(instance, options)
    return getClientState(instance, {
      apiVersion: HISTORY_API_VERSION,
      resource,
    }).observable.pipe(
      first(),
      switchMap((client) =>
        fetchDocumentTransactions(client, {
          variantId: options.variantId,
          fromTransaction: options.fromTransaction,
          toTransaction: options.toTransaction,
        }),
      ),
    )
  },
})
