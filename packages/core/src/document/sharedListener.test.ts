import {
  type ListenEvent,
  type MutationEvent,
  type ReconnectEvent,
  type SanityClient,
  type WelcomeEvent,
} from '@sanity/client'
import {createDocumentLoaderFromClient} from '@sanity/mutate/_unstable_store'
import {type SanityDocument} from '@sanity/types'
import {forkJoin, lastValueFrom, of, Subject, throwError} from 'rxjs'
import {bufferTime, catchError, toArray} from 'rxjs/operators'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {createFetchDocument, createSharedListener} from './sharedListener'

const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

vi.mock('../client/clientStore.ts', () => ({getClientState: vi.fn()}))
vi.mock('@sanity/mutate/_unstable_store', () => ({createDocumentLoaderFromClient: vi.fn()}))

describe('createSharedListener', () => {
  let fakeListenSubject: Subject<ListenEvent<SanityDocument>>
  let fakeClient: SanityClient

  beforeEach(() => {
    // Create a subject to simulate the events coming from client.listen.
    fakeListenSubject = new Subject()
    // Create a fake client whose listen() method returns our subject's observable.
    fakeClient = {
      listen: vi.fn(() => fakeListenSubject.asObservable()),
    } as unknown as SanityClient
    // Make getSubscribableClient return an observable that immediately emits fakeClient.
    vi.mocked(getClientState).mockReturnValue({
      observable: of(fakeClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should call client.listen with the expected parameters', () => {
    createSharedListener(instance).events.subscribe()
    expect(fakeClient.listen).toHaveBeenCalledTimes(1)
    expect(fakeClient.listen).toHaveBeenCalledWith(
      '*',
      {},
      {
        events: ['mutation', 'welcome', 'reconnect'],
        includeResult: false,
        tag: 'document-listener',
      },
    )
  })

  it('should merge welcome and other events (mutation/reconnect) in order', async () => {
    // Prepare some fake events.
    const welcomeEvent: WelcomeEvent = {type: 'welcome', listenerName: 'listener'}
    const mutationEvent: MutationEvent = {type: 'mutation'} as MutationEvent
    const reconnectEvent: ReconnectEvent = {type: 'reconnect'} as ReconnectEvent

    const sharedListener = createSharedListener(instance)
    // Start collecting the emitted events.
    const eventsPromise = lastValueFrom(sharedListener.events.pipe(toArray()))

    // Emit events in order.
    fakeListenSubject.next(welcomeEvent)
    fakeListenSubject.next(mutationEvent)
    fakeListenSubject.next(reconnectEvent)
    fakeListenSubject.complete()

    const events = await eventsPromise
    // Expect the merged stream to emit welcome, then mutation and reconnect.
    expect(events).toEqual([welcomeEvent, mutationEvent, reconnectEvent])
  })

  it('should replay the welcome event for new subscribers', async () => {
    const welcomeEvent: WelcomeEvent = {type: 'welcome', listenerName: 'listener'}

    const sharedListener = createSharedListener(instance)
    // First subscription: emit welcome and complete.
    const firstPromise = lastValueFrom(sharedListener.events.pipe(toArray()))
    fakeListenSubject.next(welcomeEvent)
    fakeListenSubject.complete()
    const firstEvents = await firstPromise
    expect(firstEvents).toEqual([welcomeEvent])

    // New subscriber should immediately receive the replayed welcome event.
    const secondEvents = await lastValueFrom(sharedListener.events.pipe(toArray()))
    expect(secondEvents).toEqual([welcomeEvent])
  })

  it('should propagate non-welcome events (e.g. mutation and reconnect) without replay', async () => {
    const mutationEvent = {type: 'mutation'} as MutationEvent
    const reconnectEvent = {type: 'reconnect'} as ReconnectEvent

    const sharedListener = createSharedListener(instance)
    const eventsPromise = lastValueFrom(sharedListener.events.pipe(toArray()))
    fakeListenSubject.next(mutationEvent)
    fakeListenSubject.next(reconnectEvent)
    fakeListenSubject.complete()
    const events = await eventsPromise
    expect(events).toEqual([mutationEvent, reconnectEvent])
  })

  it('should multicast events to multiple subscribers concurrently', async () => {
    const welcomeEvent = {type: 'welcome'} as WelcomeEvent
    const mutationEvent = {type: 'mutation'} as MutationEvent

    const sharedListener = createSharedListener(instance)

    // Subscribe two observers concurrently.
    const subscriber1 = sharedListener.events.pipe(bufferTime(0))
    const subscriber2 = sharedListener.events.pipe(bufferTime(0))
    const combined = forkJoin([subscriber1, subscriber2])

    const result = lastValueFrom(combined)

    // Emit events.
    fakeListenSubject.next(welcomeEvent)
    fakeListenSubject.next(mutationEvent)
    fakeListenSubject.complete()

    const [results1, results2] = await result

    // Both subscribers should receive the same sequence.
    expect(results1).toEqual([welcomeEvent, mutationEvent])
    expect(results2).toEqual([welcomeEvent, mutationEvent])
  })

  it('should propagate errors from the underlying client.listen observable', async () => {
    const errorMessage = 'Test error'
    const sharedListener = createSharedListener(instance)

    const error$ = sharedListener.events.pipe(
      toArray(),
      catchError((err) => of(err)),
    )

    fakeListenSubject.error(new Error(errorMessage))
    const result = await lastValueFrom(error$)
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe(errorMessage)
  })

  it('should stop emitting events after calling dispose', async () => {
    const welcomeEvent: WelcomeEvent = {type: 'welcome', listenerName: 'listener'}
    const mutationEvent: MutationEvent = {type: 'mutation'} as MutationEvent
    const sharedListener = createSharedListener(instance)

    const events: ListenEvent<SanityDocument>[] = []
    const subscription = sharedListener.events.subscribe((event) => {
      events.push(event)
    })

    fakeListenSubject.next(welcomeEvent)
    sharedListener.dispose()
    fakeListenSubject.next(mutationEvent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual([welcomeEvent])
    subscription.unsubscribe()
  })
})

describe('createFetchDocument', () => {
  let fakeClient: SanityClient
  let fakeLoadDocument: Mock

  beforeEach(() => {
    // Create a fake client.
    fakeClient = {fetch: vi.fn()} as unknown as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(fakeClient),
    } as StateSource<SanityClient>)

    // createDocumentLoaderFromClient returns a function (the "loader")
    fakeLoadDocument = vi.fn()
    vi.mocked(createDocumentLoaderFromClient).mockReturnValue(fakeLoadDocument)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should call createDocumentLoaderFromClient with the fetched client', async () => {
    const fetchDocument = createFetchDocument(instance)
    const accessibleResult = {
      id: 'doc1',
      document: {_id: 'doc1', _rev: 'rev1'},
      accessible: true,
    }
    fakeLoadDocument.mockReturnValue(of(accessibleResult))
    await lastValueFrom(fetchDocument('doc1'))

    expect(createDocumentLoaderFromClient).toHaveBeenCalledTimes(1)
    expect(createDocumentLoaderFromClient).toHaveBeenCalledWith(fakeClient)
  })

  it('should return the document when it is accessible', async () => {
    const fetchDocument = createFetchDocument(instance)
    const accessibleResult = {
      id: 'doc1',
      document: {_id: 'doc1', _rev: 'rev1', title: 'Test Document'},
      accessible: true,
    }
    fakeLoadDocument.mockReturnValue(of(accessibleResult))

    const doc = await lastValueFrom(fetchDocument('doc1'))
    expect(doc).toEqual(accessibleResult.document)
  })

  it('should return null when the document is inaccessible due to existence', async () => {
    const fetchDocument = createFetchDocument(instance)
    const inaccessibleResult = {
      accessible: false,
      id: 'doc1',
      reason: 'existence',
    }
    fakeLoadDocument.mockReturnValue(of(inaccessibleResult))

    const doc = await lastValueFrom(fetchDocument('doc1'))
    expect(doc).toBeNull()
  })

  it('should throw an error when the document is inaccessible due to permissions', async () => {
    const fetchDocument = createFetchDocument(instance)
    const inaccessibleResult = {
      accessible: false,
      id: 'doc1',
      reason: 'permissions',
    }
    fakeLoadDocument.mockReturnValue(of(inaccessibleResult))

    await expect(lastValueFrom(fetchDocument('doc1'))).rejects.toThrow(
      'Document with ID `doc1` is inaccessible due to permissions.',
    )
  })

  it('should propagate errors from the loadDocument observable', async () => {
    const fetchDocument = createFetchDocument(instance)
    const errorMessage = 'Load document failed'
    fakeLoadDocument.mockReturnValue(throwError(() => new Error(errorMessage)))

    await expect(lastValueFrom(fetchDocument('doc1'))).rejects.toThrow(errorMessage)
  })
})
