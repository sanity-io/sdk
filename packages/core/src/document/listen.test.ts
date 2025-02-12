import {type MutationEvent} from '@sanity/client'
import {lastValueFrom, Observable, of} from 'rxjs'
import {toArray} from 'rxjs/operators'
import {describe, expect, it, vi} from 'vitest'

import {
  DeadlineExceededError,
  type ListenerEvent,
  MaxBufferExceededError,
  sortListenerEvents,
  type SyncEvent,
} from './listen'

interface OtherEvent {
  type: 'other'
  payload: string
}

/**
 * Create a sync event.
 *
 * @param rev - The revision (can be undefined)
 * @param docId - Optional document id (default: "doc1")
 */
function createSyncEvent(rev: string, docId: string = 'doc1'): SyncEvent {
  return {
    type: 'sync',
    document: {
      _rev: rev,
      _id: docId,
      _type: 'author',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Create a mutation event with the given properties.
 */
function createMutationEvent({
  id,
  previousRev,
  resultRev,
  transition = 'update',
  docId = 'doc1',
}: {
  id: string
  previousRev: string | undefined
  resultRev: string | undefined
  transition?: 'update' | 'appear' | 'disappear'
  docId?: string
}): MutationEvent {
  return {
    type: 'mutation',
    documentId: docId,
    eventId: id,
    identity: 'user',
    mutations: [],
    timestamp: new Date().toISOString(),
    transactionId: `tx-${id}`,
    transactionCurrentEvent: 0,
    transactionTotalEvents: 1,
    previousRev,
    resultRev,
    transition,
    visibility: 'query',
  }
}

function createOtherEvent(): OtherEvent {
  return {type: 'other', payload: 'test'}
}

describe('sortListenerEvents operator', () => {
  it('should pass through sync events and reset state', async () => {
    const sync = createSyncEvent('rev1')
    const source$ = of(sync)
    const events = await lastValueFrom(source$.pipe(sortListenerEvents(), toArray()))
    expect(events).toEqual([sync])
  })

  it('should apply mutation events that chain onto the base sync event', async () => {
    const sync = createSyncEvent('rev1')
    const mutation = createMutationEvent({
      id: 'm1',
      previousRev: 'rev1',
      resultRev: 'rev2',
      transition: 'update',
    })
    const source$ = of(sync, mutation)
    const events = await lastValueFrom(source$.pipe(sortListenerEvents(), toArray()))
    // Expect the sync event to be output, then the mutation event.
    expect(events).toEqual([sync, mutation])
  })

  it('should reorder out-of-order mutation events to resolve the chain', async () => {
    const sync = createSyncEvent('rev1')
    // Mutation A: cannot apply immediately because its previousRev is "rev2"
    const mutationA = createMutationEvent({
      id: 'A',
      previousRev: 'rev2',
      resultRev: 'rev3',
      transition: 'update',
    })
    // Mutation B: chains immediately because its previousRev matches the base "rev1"
    const mutationB = createMutationEvent({
      id: 'B',
      previousRev: 'rev1',
      resultRev: 'rev2',
      transition: 'update',
    })
    const source$ = of(sync, mutationA, mutationB)
    const events = await lastValueFrom(source$.pipe(sortListenerEvents(), toArray()))
    // The operator should first emit the sync event,
    // then apply mutation B (which changes the base to "rev2"),
    // then apply mutation A (which now chains on "rev2").
    expect(events).toEqual([sync, mutationB, mutationA])
  })

  it('should process deletion events and update base to undefined', async () => {
    const sync = createSyncEvent('rev1')
    // A deletion event: even if resultRev is set, transition "disappear" forces base to undefined.
    const deletion = createMutationEvent({
      id: 'del',
      previousRev: 'rev1',
      resultRev: 'tx-del',
      transition: 'disappear',
    })
    // A follow-up mutation that expects base === undefined
    const followUp = createMutationEvent({
      id: 'm2',
      previousRev: undefined,
      resultRev: 'revX',
      transition: 'update',
    })
    const source$ = of(sync, deletion, followUp)
    const events = await lastValueFrom(source$.pipe(sortListenerEvents(), toArray()))
    expect(events).toEqual([sync, deletion, followUp])
  })

  it('should error if a mutation event arrives without a sync event first', async () => {
    const mutation = createMutationEvent({
      id: 'm1',
      previousRev: 'rev1',
      resultRev: 'rev2',
      transition: 'update',
    })
    const source$ = of(mutation)
    await expect(lastValueFrom(source$.pipe(sortListenerEvents()))).rejects.toThrow(
      'Invalid state. Cannot process mutation event without a base sync event',
    )
  })

  it('should throw MaxBufferExceededError when the buffer exceeds the max size', async () => {
    // Set a very low maxBufferSize (e.g. 2)
    const sync = createSyncEvent('rev1')
    // Two mutation events that never chain (their previousRev do not match "rev1")
    const mutation1 = createMutationEvent({
      id: 'm1',
      previousRev: 'x1',
      resultRev: 'y1',
      transition: 'update',
    })
    const mutation2 = createMutationEvent({
      id: 'm2',
      previousRev: 'x2',
      resultRev: 'y2',
      transition: 'update',
    })
    const mutation3 = createMutationEvent({
      id: 'm3',
      previousRev: 'x3',
      resultRev: 'y3',
      transition: 'update',
    })
    const source$ = of(sync, mutation1, mutation2, mutation3)
    await expect(
      lastValueFrom(source$.pipe(sortListenerEvents({maxBufferSize: 2}))),
    ).rejects.toThrow(MaxBufferExceededError)
  })

  it('should throw DeadlineExceededError when the chain does not resolve within the deadline', async () => {
    vi.useFakeTimers()
    const sync = createSyncEvent('rev1')
    // A mutation event that does not chain to "rev1"
    const mutation = createMutationEvent({
      id: 'm1',
      previousRev: 'x',
      resultRev: 'y',
      transition: 'update',
    })
    const source$ = of(sync, mutation)
    const result$ = source$.pipe(sortListenerEvents({resolveChainDeadline: 50}))
    const promise = lastValueFrom(result$)
    // Advance timers to trigger the deadline
    vi.advanceTimersByTime(50)
    await expect(promise).rejects.toThrow(DeadlineExceededError)
    vi.useRealTimers()
  })

  it('should pass through events of unknown type', async () => {
    const other = createOtherEvent()
    const source$ = of(other) as unknown as Observable<ListenerEvent>
    const events = await lastValueFrom(source$.pipe(sortListenerEvents(), toArray()))
    expect(events).toEqual([other])
  })
})
