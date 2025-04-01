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

const DEFAULT_MAX_BUFFER_SIZE = 20
const DEFAULT_DEADLINE_MS = 30000

export interface RemoteDocument {
  type: 'sync' | 'mutation'
  documentId: string
  document: SanityDocument | null
  revision?: string
  previousRev?: string
  timestamp: string
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
 * Takes an input observable of listener events that might arrive out of order, and emits them in sequence
 * If we receive mutation events that doesn't line up in [previousRev, resultRev] pairs we'll put them in a buffer and
 * check if we have an unbroken chain every time we receive a new event
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
            // Add the new mutation event into the buffer
            const buffer = state.buffer.concat(event)
            const emitEvents: MutationEvent[] = []
            let baseRevision = state.base.revision
            let progress = true

            // Try to apply as many buffered mutations as possible.
            while (progress) {
              progress = false
              // Look for a mutation whose previousRev matches the current base.
              const idx = buffer.findIndex((e) => e.previousRev === baseRevision)
              if (idx !== -1) {
                // Remove the event from the buffer and “apply” it.
                const [next] = buffer.splice(idx, 1)
                emitEvents.push(next)
                // If the mutation is a deletion, the new base revision is undefined.
                baseRevision = next.transition === 'disappear' ? undefined : next.resultRev
                progress = true
              }
            }

            if (buffer.length >= maxBufferSize) {
              throw new MaxBufferExceededError(
                `Too many unchainable mutation events (${buffer.length}) waiting to resolve.`,
                {base: {revision: baseRevision}, buffer, emitEvents},
              )
            }

            return {
              base: {revision: baseRevision},
              buffer,
              emitEvents,
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
      if (e.type === 'welcome') {
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
        ...(previousRev && {previousRev}),
      }
    }),
  )
}
