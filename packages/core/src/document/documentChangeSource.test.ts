import {
  type ListenEvent,
  type MutationEvent,
  type ReconnectEvent,
  type SanityDocument,
  type WelcomeEvent,
} from '@sanity/client'
import {merge, Observable, ReplaySubject, share, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type DocumentChangeEvent, observeDocumentChanges} from './documentChangeSource'
import {createSharedListener} from './sharedListener'

vi.mock('./sharedListener', () => ({
  createSharedListener: vi.fn(),
}))

function createMutationEvent(
  overrides: Partial<MutationEvent<SanityDocument>> = {},
): MutationEvent<SanityDocument> {
  return {
    type: 'mutation',
    documentId: 'drafts.doc-1',
    eventId: 'ev-1',
    identity: 'user-1',
    mutations: [],
    timestamp: '2025-05-06T12:00:00.000Z',
    transactionId: 'tx-1',
    transition: 'update',
    visibility: 'query',
    effects: {apply: [], revert: []},
    previousRev: 'rev-0',
    resultRev: 'rev-1',
    transactionTotalEvents: 1,
    transactionCurrentEvent: 1,
    ...overrides,
  }
}

describe('documentChangeSource', () => {
  let instance: SanityInstance
  let rawEvents$: Subject<ListenEvent<SanityDocument>>
  let welcome$: ReplaySubject<WelcomeEvent>
  let disposeSpy: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    vi.clearAllMocks()
    rawEvents$ = new Subject<ListenEvent<SanityDocument>>()
    welcome$ = new ReplaySubject<WelcomeEvent>(1)
    disposeSpy = vi.fn<() => void>()

    const events$: Observable<ListenEvent<SanityDocument>> = merge(
      welcome$,
      rawEvents$.pipe(share()),
    )

    vi.mocked(createSharedListener).mockReturnValue({
      events: events$,
      dispose: disposeSpy,
    })

    instance = createSanityInstance({projectId: 'proj-1', dataset: 'production'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('normalizes initial welcome to connected, subsequent welcomes and resets to resync, and drops welcomeback/reconnect', () => {
    const received: DocumentChangeEvent[] = []
    const sub = observeDocumentChanges(instance, {}).subscribe((e) => received.push(e))

    welcome$.next({type: 'welcome', listenerName: 'l-1'})
    rawEvents$.next({type: 'reconnect'} as ReconnectEvent)
    rawEvents$.next({type: 'welcomeback', listenerName: 'l-1'})
    rawEvents$.next(createMutationEvent({documentId: 'drafts.doc-1', transactionId: 'tx-1'}))
    rawEvents$.next({type: 'reset'})
    welcome$.next({type: 'welcome', listenerName: 'l-2'})

    expect(received).toEqual([
      {type: 'connected'},
      {
        type: 'mutation',
        documentId: 'drafts.doc-1',
        transactionId: 'tx-1',
        transition: 'update',
        timestamp: '2025-05-06T12:00:00.000Z',
        identity: 'user-1',
        previousRev: 'rev-0',
        resultRev: 'rev-1',
        mutations: [],
      },
      {type: 'resync'},
      {type: 'resync'},
    ])

    sub.unsubscribe()
  })

  it('replays connected for late subscribers and emits resync to both on subsequent reconnect', () => {
    const firstEvents: DocumentChangeEvent[] = []
    const secondEvents: DocumentChangeEvent[] = []

    const sub1 = observeDocumentChanges(instance, {}).subscribe((e) => firstEvents.push(e))
    welcome$.next({type: 'welcome', listenerName: 'l-1'})

    const sub2 = observeDocumentChanges(instance, {}).subscribe((e) => secondEvents.push(e))

    expect(firstEvents).toEqual([{type: 'connected'}])
    expect(secondEvents).toEqual([{type: 'connected'}])

    // Subsequent welcome (e.g. unresumable reconnect or client rotation) becomes resync for both
    welcome$.next({type: 'welcome', listenerName: 'l-2'})

    expect(firstEvents).toEqual([{type: 'connected'}, {type: 'resync'}])
    expect(secondEvents).toEqual([{type: 'connected'}, {type: 'resync'}])

    sub1.unsubscribe()
    sub2.unsubscribe()
  })

  it('filters mutations by documentIds while always forwarding lifecycle events', () => {
    const received: DocumentChangeEvent[] = []
    const sub = observeDocumentChanges(instance, {
      documentIds: ['drafts.doc-a', 'doc-a'],
    }).subscribe((e) => received.push(e))

    welcome$.next({type: 'welcome', listenerName: 'l-1'})
    rawEvents$.next(createMutationEvent({documentId: 'drafts.doc-b', transactionId: 'tx-other'}))
    rawEvents$.next(createMutationEvent({documentId: 'doc-a', transactionId: 'tx-match'}))
    rawEvents$.next({type: 'reset'})

    expect(received.map((e) => (e.type === 'mutation' ? e.documentId : e.type))).toEqual([
      'connected',
      'doc-a',
      'resync',
    ])

    sub.unsubscribe()
  })

  it('shares a single listener per resource and disposes it with the instance', () => {
    const sub1 = observeDocumentChanges(instance, {documentIds: ['doc-a']}).subscribe()
    const sub2 = observeDocumentChanges(instance, {documentIds: ['doc-b']}).subscribe()

    expect(createSharedListener).toHaveBeenCalledTimes(1)

    sub1.unsubscribe()
    sub2.unsubscribe()
    expect(disposeSpy).not.toHaveBeenCalled()

    instance.dispose()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})
