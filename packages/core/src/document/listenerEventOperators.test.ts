import {
  type ListenEvent,
  type MutationEvent,
  type ReconnectEvent,
  type WelcomeEvent,
} from '@sanity/client'
import {type SanityDocument} from '@sanity/types'
import {from, lastValueFrom, type Observable, Subject} from 'rxjs'
import {toArray} from 'rxjs/operators'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {dedupeListenerEvents, groupTransactionEvents} from './listenerEventOperators'

function listenEventsOf(
  ...events: ListenEvent<SanityDocument>[]
): Observable<ListenEvent<SanityDocument>> {
  return from(events)
}

function createMutationEvent({
  transactionId,
  documentId = 'doc1',
  transactionCurrentEvent = 1,
  transactionTotalEvents = 1,
}: {
  transactionId: string
  documentId?: string
  transactionCurrentEvent?: number
  transactionTotalEvents?: number
}): MutationEvent {
  return {
    type: 'mutation',
    documentId,
    eventId: `${transactionId}#${documentId}`,
    identity: 'user',
    mutations: [],
    timestamp: new Date().toISOString(),
    transactionId,
    transactionCurrentEvent,
    transactionTotalEvents,
    transition: 'update',
    visibility: 'query',
    resultRev: transactionId,
  }
}

const welcomeEvent: WelcomeEvent = {type: 'welcome', listenerName: 'listener'}
const reconnectEvent = {type: 'reconnect'} as ReconnectEvent

afterEach(() => {
  vi.useRealTimers()
})

describe('dedupeListenerEvents', () => {
  it('passes unique mutation events through', async () => {
    const m1 = createMutationEvent({transactionId: 'txn1'})
    const m2 = createMutationEvent({transactionId: 'txn2'})
    const events = await lastValueFrom(
      listenEventsOf(m1, m2).pipe(dedupeListenerEvents(), toArray()),
    )
    expect(events).toEqual([m1, m2])
  })

  it('drops replayed duplicates of the same transaction and document', async () => {
    const m1 = createMutationEvent({transactionId: 'txn1'})
    const replay = createMutationEvent({transactionId: 'txn1'})
    const events = await lastValueFrom(
      listenEventsOf(m1, replay).pipe(dedupeListenerEvents(), toArray()),
    )
    expect(events).toEqual([m1])
  })

  it('does not dedupe events of the same transaction for different documents', async () => {
    const draft = createMutationEvent({transactionId: 'txn1', documentId: 'drafts.doc1'})
    const published = createMutationEvent({transactionId: 'txn1', documentId: 'doc1'})
    const events = await lastValueFrom(
      listenEventsOf(draft, published).pipe(dedupeListenerEvents(), toArray()),
    )
    expect(events).toEqual([draft, published])
  })

  it('passes non-mutation events through untouched', async () => {
    const events = await lastValueFrom(
      listenEventsOf(welcomeEvent, reconnectEvent).pipe(dedupeListenerEvents(), toArray()),
    )
    expect(events).toEqual([welcomeEvent, reconnectEvent])
  })

  it('allows a key again after its TTL has passed', async () => {
    vi.useFakeTimers()
    const source = new Subject<ListenEvent<SanityDocument>>()
    const received: ListenEvent<SanityDocument>[] = []
    const subscription = source
      .pipe(dedupeListenerEvents({ttl: 1000}))
      .subscribe((e) => received.push(e))

    source.next(createMutationEvent({transactionId: 'txn1'}))
    source.next(createMutationEvent({transactionId: 'txn1'}))
    expect(received).toHaveLength(1)

    vi.advanceTimersByTime(1001)
    source.next(createMutationEvent({transactionId: 'txn1'}))
    expect(received).toHaveLength(2)

    subscription.unsubscribe()
  })

  it('evicts the oldest entries when the cache exceeds maxEntries', async () => {
    const source = new Subject<ListenEvent<SanityDocument>>()
    const received: ListenEvent<SanityDocument>[] = []
    const subscription = source
      .pipe(dedupeListenerEvents({maxEntries: 2}))
      .subscribe((e) => received.push(e))

    source.next(createMutationEvent({transactionId: 'txn1'}))
    source.next(createMutationEvent({transactionId: 'txn2'}))
    source.next(createMutationEvent({transactionId: 'txn3'}))
    // txn1 was evicted to make room, so a replay of it passes through again
    source.next(createMutationEvent({transactionId: 'txn1'}))
    expect(received).toHaveLength(4)

    subscription.unsubscribe()
  })
})

describe('groupTransactionEvents', () => {
  it('passes single-event transactions through immediately', async () => {
    const m1 = createMutationEvent({transactionId: 'txn1'})
    const events = await lastValueFrom(listenEventsOf(m1).pipe(groupTransactionEvents(), toArray()))
    expect(events).toEqual([m1])
  })

  it('holds multi-document transaction events until the transaction is complete', () => {
    const source = new Subject<ListenEvent<SanityDocument>>()
    const received: ListenEvent<SanityDocument>[] = []
    const subscription = source.pipe(groupTransactionEvents()).subscribe((e) => received.push(e))

    const draftEvent = createMutationEvent({
      transactionId: 'txn-publish',
      documentId: 'drafts.doc1',
      transactionCurrentEvent: 1,
      transactionTotalEvents: 2,
    })
    const publishedEvent = createMutationEvent({
      transactionId: 'txn-publish',
      documentId: 'doc1',
      transactionCurrentEvent: 2,
      transactionTotalEvents: 2,
    })

    source.next(draftEvent)
    expect(received).toEqual([])

    source.next(publishedEvent)
    expect(received).toEqual([draftEvent, publishedEvent])

    subscription.unsubscribe()
  })

  it('holds intervening events until the open transaction completes, then releases them after it', () => {
    const source = new Subject<ListenEvent<SanityDocument>>()
    const received: ListenEvent<SanityDocument>[] = []
    const subscription = source.pipe(groupTransactionEvents()).subscribe((e) => received.push(e))

    const draftEvent = createMutationEvent({
      transactionId: 'txn-publish',
      documentId: 'drafts.doc1',
      transactionCurrentEvent: 1,
      transactionTotalEvents: 2,
    })
    // an unrelated single-document mutation interleaved between the two
    // halves of the publish (legacy listener pipeline behavior)
    const intervening = createMutationEvent({transactionId: 'txn-other', documentId: 'doc9'})
    const publishedEvent = createMutationEvent({
      transactionId: 'txn-publish',
      documentId: 'doc1',
      transactionCurrentEvent: 2,
      transactionTotalEvents: 2,
    })

    source.next(draftEvent)
    source.next(intervening)
    expect(received).toEqual([])

    source.next(publishedEvent)
    expect(received).toEqual([draftEvent, publishedEvent, intervening])

    subscription.unsubscribe()
  })

  it('groups a held multi-document transaction after the open one completes', () => {
    const source = new Subject<ListenEvent<SanityDocument>>()
    const received: ListenEvent<SanityDocument>[] = []
    const subscription = source.pipe(groupTransactionEvents()).subscribe((e) => received.push(e))

    const a1 = createMutationEvent({
      transactionId: 'txn-a',
      documentId: 'drafts.doc1',
      transactionTotalEvents: 2,
    })
    const b1 = createMutationEvent({
      transactionId: 'txn-b',
      documentId: 'drafts.doc2',
      transactionTotalEvents: 2,
    })
    const b2 = createMutationEvent({
      transactionId: 'txn-b',
      documentId: 'doc2',
      transactionTotalEvents: 2,
    })
    const a2 = createMutationEvent({
      transactionId: 'txn-a',
      documentId: 'doc1',
      transactionTotalEvents: 2,
    })

    source.next(a1)
    source.next(b1)
    source.next(b2)
    expect(received).toEqual([])

    source.next(a2)
    // txn-a completes and is emitted contiguously; the held txn-b events are
    // re-processed and, being complete, emitted contiguously right after
    expect(received).toEqual([a1, a2, b1, b2])

    subscription.unsubscribe()
  })

  it('releases everything in arrival order when the held queue exceeds its cap', () => {
    const source = new Subject<ListenEvent<SanityDocument>>()
    const received: ListenEvent<SanityDocument>[] = []
    const subscription = source
      .pipe(groupTransactionEvents({maxHeldEvents: 2}))
      .subscribe((e) => received.push(e))

    const partial = createMutationEvent({
      transactionId: 'txn-incomplete',
      documentId: 'drafts.doc1',
      transactionTotalEvents: 2,
    })
    const held1 = createMutationEvent({transactionId: 'txn-h1', documentId: 'doc8'})
    const held2 = createMutationEvent({transactionId: 'txn-h2', documentId: 'doc9'})
    const overflow = createMutationEvent({transactionId: 'txn-h3', documentId: 'doc10'})

    source.next(partial)
    source.next(held1)
    source.next(held2)
    expect(received).toEqual([])

    source.next(overflow)
    expect(received).toEqual([partial, held1, held2, overflow])

    subscription.unsubscribe()
  })

  it('flushes buffered events before non-mutation events', () => {
    const source = new Subject<ListenEvent<SanityDocument>>()
    const received: ListenEvent<SanityDocument>[] = []
    const subscription = source.pipe(groupTransactionEvents()).subscribe((e) => received.push(e))

    const partial = createMutationEvent({
      transactionId: 'txn-incomplete',
      documentId: 'drafts.doc1',
      transactionTotalEvents: 2,
    })

    source.next(partial)
    source.next(reconnectEvent)
    expect(received).toEqual([partial, reconnectEvent])

    subscription.unsubscribe()
  })

  it('flushes an incomplete transaction and its held events after the deadline', () => {
    vi.useFakeTimers()
    const source = new Subject<ListenEvent<SanityDocument>>()
    const received: ListenEvent<SanityDocument>[] = []
    const subscription = source
      .pipe(groupTransactionEvents({flushDeadline: 500}))
      .subscribe((e) => received.push(e))

    const partial = createMutationEvent({
      transactionId: 'txn-incomplete',
      documentId: 'drafts.doc1',
      transactionTotalEvents: 2,
    })
    const heldBehind = createMutationEvent({transactionId: 'txn-held', documentId: 'doc9'})

    source.next(partial)
    source.next(heldBehind)
    expect(received).toEqual([])

    vi.advanceTimersByTime(500)
    expect(received).toEqual([partial, heldBehind])

    subscription.unsubscribe()
  })

  it('flushes buffered events on completion', async () => {
    const partial = createMutationEvent({
      transactionId: 'txn-incomplete',
      documentId: 'drafts.doc1',
      transactionTotalEvents: 2,
    })
    const events = await lastValueFrom(
      listenEventsOf(partial).pipe(groupTransactionEvents(), toArray()),
    )
    expect(events).toEqual([partial])
  })
})
