import {type MutationEvent} from '@sanity/client'
import {type Mutation, type SanityDocument} from '@sanity/types'
import {
  concat,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  type Observable,
  of,
  switchMap,
  throwError,
  timer,
  withLatestFrom,
} from 'rxjs'
import {mergeMap, scan} from 'rxjs/operators'

import {type StoreContext} from '../store/defineStore'
import {type DocumentStoreState} from './documentStore'
import {processMutations} from './processMutations'

export const DEFAULT_MAX_BUFFER_SIZE = 20
const DEFAULT_DEADLINE_MS = 30000

export interface RemoteDocument {
  type: 'sync' | 'mutation'
  documentId: string
  document: SanityDocument | null
  revision?: string
  previousRev?: string
  timestamp: string
  /**
   * The raw mutations from the listener event that produced this document.
   * Only present for `'mutation'` events. These carry the operational intent
   * of the remote change (e.g. keyed patches) before it is collapsed into a
   * whole document snapshot.
   */
  mutations?: Mutation[]
}

export interface SyncEvent {
  type: 'sync'
  document: SanityDocument | null
}

export type ListenerEvent = SyncEvent | MutationEvent

interface ListenerSequenceState {
  /**
   * Tracks the latest revision from the server that can be applied locally
   * Once we receive a mutation event that has a `previousRev` that equals `base.revision`
   * we will move `base.revision` to the event's `resultRev`
   * `base.revision` will be undefined if document doesn't exist.
   * `base` is `undefined` until the snapshot event is received
   */
  base: {revision: string | undefined} | undefined
  /**
   * Array of events to pass on to the stream, e.g. when mutation applies to current head revision, or a chain is complete
   */
  emitEvents: ListenerEvent[]
  /**
   * Buffer to keep track of events that doesn't line up in a [previousRev, resultRev] -- [previousRev, resultRev] sequence
   * This can happen if events arrive out of order, or if an event in the middle for some reason gets lost
   */
  buffer: MutationEvent[]
}

export class OutOfSyncError extends Error {
  /**
   * Attach state to the error for debugging/reporting
   */
  state: ListenerSequenceState
  constructor(message: string, state: ListenerSequenceState) {
    super(message)
    this.name = 'OutOfSyncError'
    this.state = state
  }
}

export class DeadlineExceededError extends OutOfSyncError {
  constructor(message: string, state: ListenerSequenceState) {
    super(message, state)
    this.name = 'DeadlineExceededError'
  }
}

export class MaxBufferExceededError extends OutOfSyncError {
  constructor(message: string, state: ListenerSequenceState) {
    super(message, state)
    this.name = 'MaxBufferExceededError'
  }
}

interface SortListenerEventsOptions {
  maxBufferSize?: number
  resolveChainDeadline?: number
}

/**
 * Orders the given mutation events into chains where each event's
 * `previousRev` points at another event's `resultRev`. Events whose
 * `previousRev` matches no other event start a new chain. The buffer may have
 * multiple holes in it, so multiple chains can exist at once.
 */
function toOrderedChains(events: MutationEvent[]): MutationEvent[][] {
  const chainStarts = events.filter(
    (event) => !events.some((other) => other.resultRev === event.previousRev),
  )

  return chainStarts.map((start) => {
    const chain: MutationEvent[] = []
    let current: MutationEvent | undefined = start
    while (current) {
      chain.push(current)
      const currentResultRev: string | undefined = current.resultRev
      current = events.find((event) => event.previousRev === currentResultRev)
    }
    return chain
  })
}

/**
 * Discards the leading events of a chain up to and including the event whose
 * `resultRev` equals the given revision. These events describe changes that
 * are already reflected in the current base (e.g. events replayed by a
 * resumed listener after the snapshot was refetched).
 */
function discardChainTo(chain: MutationEvent[], revision: string | undefined): MutationEvent[] {
  const revisionIndex = chain.findIndex((event) => event.resultRev === revision)
  if (revisionIndex === -1) return chain
  return chain.slice(revisionIndex + 1)
}

/**
 * Takes an input observable of listener events that might arrive out of order, and emits them in sequence
 * If we receive mutation events that doesn't line up in [previousRev, resultRev] pairs we'll put them in a buffer and
 * check if we have an unbroken chain every time we receive a new event
 *
 * Buffered chains that lead up to the current base revision are discarded:
 * they describe changes already reflected in the base (e.g. events replayed
 * by a resumed listener after the snapshot was refetched)
 *
 * If the buffer grows beyond `maxBufferSize`, or if `resolveChainDeadline` milliseconds passes before the chain resolves
 * an OutOfSyncError will be thrown on the stream
 *
 * @internal
 */
export function sortListenerEvents(options?: SortListenerEventsOptions) {
  const {resolveChainDeadline = DEFAULT_DEADLINE_MS, maxBufferSize = DEFAULT_MAX_BUFFER_SIZE} =
    options || {}

  return (input$: Observable<ListenerEvent>): Observable<ListenerEvent> => {
    return input$.pipe(
      // Maintain state: current base revision, a buffer of pending mutation events,
      // and a list of events to emit.
      scan(
        (state: ListenerSequenceState, event: ListenerEvent): ListenerSequenceState => {
          // When a sync event is received, reset the base and clear any pending mutations.
          if (event.type === 'sync') {
            return {
              base: {revision: event.document?._rev},
              buffer: [],
              emitEvents: [event],
            }
          }
          // For mutation events we must have a base revision (from a prior sync event)
          if (event.type === 'mutation') {
            if (!state.base) {
              throw new Error(
                'Invalid state. Cannot process mutation event without a base sync event',
              )
            }
            const baseRevision = state.base.revision

            // Order the buffered events (plus the new one) into chains, then
            // drop the parts of each chain the base already reflects.
            const chains = toOrderedChains(state.buffer.concat(event))
              .map((chain) => discardChainTo(chain, baseRevision))
              .filter((chain) => chain.length > 0)

            // A chain whose head continues the current base revision can be
            // applied. There can be at most one; anything else stays buffered.
            const applicable = chains.find((chain) => chain[0].previousRev === baseRevision)
            const buffer = chains.filter((chain) => chain !== applicable).flat()

            if (applicable) {
              const last = applicable[applicable.length - 1]
              return {
                // If the chain ends in a deletion, the new base revision is undefined.
                base: {revision: last.transition === 'disappear' ? undefined : last.resultRev},
                buffer,
                emitEvents: applicable,
              }
            }

            if (buffer.length >= maxBufferSize) {
              throw new MaxBufferExceededError(
                `Too many unchainable mutation events (${buffer.length}) waiting to resolve.`,
                {base: {revision: baseRevision}, buffer, emitEvents: []},
              )
            }

            return {
              base: {revision: baseRevision},
              buffer,
              emitEvents: [],
            }
          }
          // Any other event is simply forwarded.
          return {...state, emitEvents: [event]}
        },
        {
          base: undefined,
          buffer: [] as MutationEvent[],
          emitEvents: [] as ListenerEvent[],
        },
      ),
      switchMap((state) => {
        if (state.buffer.length > 0) {
          return concat(
            of(state),
            timer(resolveChainDeadline).pipe(
              mergeMap(() =>
                throwError(
                  () =>
                    new DeadlineExceededError(
                      `Did not resolve chain within a deadline of ${resolveChainDeadline}ms`,
                      state,
                    ),
                ),
              ),
            ),
          )
        }
        return of(state)
      }),
      // Emit all events that are ready to be applied.
      mergeMap((state) => of(...state.emitEvents)),
    )
  }
}

export const listen = (
  {state}: StoreContext<DocumentStoreState>,
  documentId: string,
): Observable<RemoteDocument> => {
  const {sharedListener, fetchDocument} = state.get()

  return sharedListener.events.pipe(
    concatMap((e) => {
      // `welcome` means a fresh listener connection and `reset` means a
      // resumed listener could not replay what was missed; both require
      // refetching the snapshot. a `welcomeback` means the resume succeeded
      // and the missed events were replayed, so no refetch is needed
      if (e.type === 'welcome' || e.type === 'reset') {
        return fetchDocument(documentId).pipe(
          map((document): SyncEvent => ({type: 'sync', document})),
        )
      }
      if (e.type === 'mutation' && e.documentId === documentId) return of(e)
      return EMPTY
    }),
    sortListenerEvents(),
    withLatestFrom(
      state.observable.pipe(
        map((s) => s.documentStates[documentId]),
        filter(Boolean),
        distinctUntilChanged(),
      ),
    ),
    map(([next, documentState]): RemoteDocument => {
      if (next.type === 'sync') {
        return {
          type: 'sync',
          documentId,
          document: next.document,
          revision: next.document?._rev,
          timestamp: next.document?._updatedAt ?? new Date().toISOString(),
        }
      }

      // TODO: from manual testing, mendoza patches seem to be applying
      // let document
      // if (next.effects?.apply) {
      //   document = applyPatch(omit(documentState.remote, '_rev'), next.effects?.apply)
      // }

      const [document] = Object.values(
        processMutations({
          documents: {[documentId]: documentState.remote},
          mutations: next.mutations as Mutation[],
          transactionId: next.transactionId,
          timestamp: next.timestamp,
        }),
      )

      const {previousRev, transactionId, timestamp} = next

      return {
        type: 'mutation',
        documentId,
        document: document ?? null,
        revision: transactionId,
        timestamp,
        mutations: next.mutations as Mutation[],
        ...(previousRev && {previousRev}),
      }
    }),
  )
}
