import {type MutationEvent} from '@sanity/client'
import {lastValueFrom, Observable, of} from 'rxjs'
import {toArray} from 'rxjs/operators'
import {describe, expect, it, vi} from 'vitest'

import {
  DeadlineExceededError,
  type ListenerEvent,
  MaxBufferExceededError,
  remoteAfter,
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

  it('should discard replayed events already reflected in the base', async () => {
    // The snapshot is at rev2; a resumed listener replays the event that
    // produced rev2. It should be discarded instead of clogging the buffer.
    const sync = createSyncEvent('rev2')
    const replayed = createMutationEvent({
      id: 'replayed',
      previousRev: 'rev1',
      resultRev: 'rev2',
    })
    const source$ = of(sync, replayed)
    const events = await lastValueFrom(source$.pipe(sortListenerEvents(), toArray()))
    expect(events).toEqual([sync])
  })

  it('should discard the replayed part of a chain and apply the rest', async () => {
    // The snapshot is at rev2; the listener replays rev1->rev2 followed by a
    // genuinely new rev2->rev3. Only the new event should be emitted.
    const sync = createSyncEvent('rev2')
    const replayed = createMutationEvent({
      id: 'replayed',
      previousRev: 'rev1',
      resultRev: 'rev2',
    })
    const fresh = createMutationEvent({
      id: 'fresh',
      previousRev: 'rev2',
      resultRev: 'rev3',
    })
    const source$ = of(sync, replayed, fresh)
    const events = await lastValueFrom(source$.pipe(sortListenerEvents(), toArray()))
    expect(events).toEqual([sync, fresh])
  })

  it('should discard a multi-event replayed chain that leads up to the base', async () => {
    const sync = createSyncEvent('rev3')
    // two replayed events that together lead up to the base revision
    const replayedA = createMutationEvent({
      id: 'replayedA',
      previousRev: 'rev1',
      resultRev: 'rev2',
    })
    const replayedB = createMutationEvent({
      id: 'replayedB',
      previousRev: 'rev2',
      resultRev: 'rev3',
    })
    const fresh = createMutationEvent({
      id: 'fresh',
      previousRev: 'rev3',
      resultRev: 'rev4',
    })
    const source$ = of(sync, replayedA, replayedB, fresh)
    const events = await lastValueFrom(source$.pipe(sortListenerEvents(), toArray()))
    expect(events).toEqual([sync, fresh])
  })
})

describe('remoteAfter', () => {
  // A real listener event for: set title to "Hello brave world", insert "tech" after the last
  // tag. Content Lake computed the effects without `_rev`.
  const previous = {
    _id: 'drafts.post-1',
    _type: 'post',
    title: 'Hello world',
    tags: ['news', 'sports'],
    _createdAt: '2026-11-20T13:56:19.700Z',
    _updatedAt: '2026-11-20T13:56:19.700Z',
    _rev: 'rev-1',
  }
  // Content Lake uses the transaction id as the resulting revision.
  const event = {
    ...createMutationEvent({
      id: 'rev-2',
      previousRev: 'rev-1',
      resultRev: 'rev-2',
      docId: 'drafts.post-1',
    }),
    transactionId: 'rev-2',
  }
  const mutations = [
    {
      patch: {
        id: 'drafts.post-1',
        set: {title: 'Hello brave world'},
        insert: {after: 'tags[-1]', items: ['tech']},
      },
    },
  ]
  const effects = {
    apply: [
      11,
      3,
      23,
      0,
      20,
      22,
      '811',
      23,
      23,
      24,
      15,
      11,
      4,
      21,
      0,
      2,
      20,
      'tech',
      15,
      11,
      5,
      23,
      0,
      6,
      22,
      'brave ',
      23,
      6,
      11,
      15,
    ],
    revert: [],
  }

  it("builds the stored document from the event's effects, with _rev from the result", () => {
    expect(
      remoteAfter({...event, mutations, effects} as MutationEvent, 'drafts.post-1', previous),
    ).toEqual({
      ...previous,
      title: 'Hello brave world',
      tags: ['news', 'sports', 'tech'],
      _updatedAt: '2026-11-20T13:56:19.811Z',
      _rev: 'rev-2',
    })
  })

  it('replays the mutations when the event has no effects', () => {
    expect(
      remoteAfter({...event, mutations} as MutationEvent, 'drafts.post-1', previous),
    ).toMatchObject({
      title: 'Hello brave world',
      tags: ['news', 'sports', 'tech'],
      _rev: 'rev-2',
    })
  })
})
