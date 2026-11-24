import {type ListenEvent, type MutationEvent, type SanityDocument} from '@sanity/client'
import {type Mutation} from '@sanity/types'
import {filter, map, type Observable, scan} from 'rxjs'

import {type DocumentResource} from '../config/sanityConfig'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {defineStore} from '../store/defineStore'
import {createSharedListener, type SharedListener} from './sharedListener'

/**
 * A document mutation delivered by the shared per-resource document change source.
 *
 * Events are already deduplicated across resumed connections and grouped so
 * multi-document transactions arrive contiguously.
 *
 * @internal
 */
export interface DocumentMutationChangeEvent {
  type: 'mutation'
  documentId: string
  transactionId: string
  transition: MutationEvent['transition']
  timestamp: string
  identity: string
  previousRev?: string
  resultRev?: string
  mutations: Mutation[]
}

/**
 * High-level events emitted by the shared per-resource document change source.
 *
 * Raw transport events (`welcome`, `welcomeback`, `reconnect`, `reset`) are
 * normalized into semantic lifecycle signals so consumers do not need to handle
 * listener protocol details:
 * - `connected`: initial connection is established (replayed once for late subscribers).
 * - `resync`: the connection could not resume cleanly (a `reset` or a post-connect
 *   `welcome`) and missed mutations are possible; consumers should refetch.
 * - `mutation`: a document changed in the resource.
 *
 * @internal
 */
export type DocumentChangeEvent =
  | {type: 'connected'}
  | {type: 'resync'}
  | DocumentMutationChangeEvent

/**
 * Options for observing document changes within a resource.
 *
 * @internal
 */
export interface ObserveDocumentChangesOptions {
  resource?: DocumentResource
  /**
   * Optional set of document IDs to restrict emitted `mutation` events to.
   * Lifecycle events (`connected`, `resync`) are always forwarded.
   */
  documentIds?: Iterable<string>
}

interface DocumentChangeSourceState {
  sharedListener: SharedListener
}

interface NormalizationState {
  hasConnected: boolean
  emitted?: DocumentChangeEvent
}

const documentChangeSourceStore = defineStore<DocumentChangeSourceState, BoundResourceKey>({
  name: 'DocumentChangeSource',
  getInitialState: (instance, {resource}) => ({
    sharedListener: createSharedListener(instance, resource),
  }),
  initialize: (context) => {
    const {sharedListener} = context.state.get()
    return () => sharedListener.dispose()
  },
})

function toDocumentMutationEvent(
  event: MutationEvent<SanityDocument>,
): DocumentMutationChangeEvent {
  return {
    type: 'mutation',
    documentId: event.documentId,
    transactionId: event.transactionId,
    transition: event.transition,
    timestamp: event.timestamp,
    identity: event.identity,
    previousRev: event.previousRev,
    resultRev: event.resultRev,
    mutations: event.mutations as Mutation[],
  }
}

function normalizeDocumentChangeEvents(
  events$: Observable<ListenEvent<SanityDocument>>,
  documentIds?: Iterable<string>,
): Observable<DocumentChangeEvent> {
  const watchedIds = documentIds ? new Set(documentIds) : undefined

  return events$.pipe(
    scan(
      (acc: NormalizationState, event: ListenEvent<SanityDocument>): NormalizationState => {
        if (event.type === 'welcome') {
          return {
            hasConnected: true,
            emitted: acc.hasConnected ? {type: 'resync'} : {type: 'connected'},
          }
        }
        if (event.type === 'reset') {
          return {
            hasConnected: acc.hasConnected,
            emitted: {type: 'resync'},
          }
        }
        if (event.type === 'mutation') {
          if (watchedIds && !watchedIds.has(event.documentId)) {
            return {hasConnected: acc.hasConnected}
          }
          return {
            hasConnected: acc.hasConnected,
            emitted: toDocumentMutationEvent(event),
          }
        }
        // `welcomeback` and `reconnect` are transport-level resume/retry signals
        return {hasConnected: acc.hasConnected}
      },
      {hasConnected: false},
    ),
    map((acc) => acc.emitted),
    filter((event): event is DocumentChangeEvent => event !== undefined),
  )
}

/**
 * Observes normalized document change and lifecycle events for a resource.
 *
 * Backed by a single shared Content Lake listener per `(instance, resource)`, so
 * independent stores (such as `documentStore`, `historyStore`, and future
 * multi-document hooks) share one connection without coupling to one another.
 *
 * @internal
 */
export const observeDocumentChanges = bindActionByResource(
  documentChangeSourceStore,
  ({state}, options: ObserveDocumentChangesOptions): Observable<DocumentChangeEvent> =>
    normalizeDocumentChangeEvents(state.get().sharedListener.events, options.documentIds),
)
