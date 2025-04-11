import {
  type ListenEvent,
  type MutationEvent,
  type SanityClient,
  type SanityDocument,
  type WelcomeEvent,
} from '@sanity/client'
import {of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {listenQuery} from './listenQuery'

describe('listenQuery', () => {
  const mockFetch = vi.fn()
  const mockListen = vi.fn()

  const mockClient = {
    observable: {
      fetch: mockFetch,
    },
    listen: mockListen,
  } as unknown as SanityClient

  const mockDoc: SanityDocument = {
    _id: 'doc1',
    _type: 'test',
    _rev: 'rev1',
    _createdAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
  }
  const mockQuery = '*[_type == "test"]'

  const createMutationEvent = (
    transition: 'update' | 'appear' | 'disappear',
    eventId: string,
    transactionId: string,
  ): MutationEvent<SanityDocument> => ({
    type: 'mutation',
    documentId: 'doc1',
    eventId,
    identity: 'test-user',
    mutations: [{create: mockDoc}],
    timestamp: new Date().toISOString(),
    transition,
    visibility: 'query',
    effects: {
      apply: [],
      revert: [],
    },
    result: mockDoc,
    transactionId,
    transactionTotalEvents: 1,
    transactionCurrentEvent: 1,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('performs initial fetch and listens for updates', async () => {
    const events$ = new Subject<ListenEvent<SanityDocument>>()
    mockListen.mockReturnValue(events$)
    mockFetch.mockReturnValue(of([mockDoc]))

    const results: ListenEvent<Record<string, unknown>>[] = []
    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, mockQuery).subscribe({
        next: (result) => {
          results.push(result as ListenEvent<Record<string, unknown>>)
          if (results.length === 2) {
            expect(results).toEqual([[mockDoc], [mockDoc, mockDoc]])
            resolve()
          }
        },
      })
    })

    // Emit welcome event to trigger initial fetch
    events$.next({
      type: 'welcome',
      listenerName: 'test-listener',
    } as WelcomeEvent)

    // Emit mutation event to trigger refetch
    mockFetch.mockReturnValue(of([mockDoc, mockDoc]))
    events$.next(createMutationEvent('update', 'evt1', 'tx1'))
    vi.advanceTimersByTime(1000)

    await promise
  })

  it('handles separate fetch and listen queries', async () => {
    const events$ = new Subject<ListenEvent<SanityDocument>>()
    mockListen.mockReturnValue(events$)
    mockFetch.mockReturnValue(of([mockDoc]))

    const query = {
      fetch: '*[_type == "test"] {_id, _type}',
      listen: '*[_type == "test"]',
    }

    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, query).subscribe({
        next: () => {
          expect(mockListen).toHaveBeenCalledWith(
            query.listen,
            {},
            expect.objectContaining({
              events: ['welcome', 'mutation', 'reconnect'],
              includeResult: false,
            }),
          )
          expect(mockFetch).toHaveBeenCalledWith(
            query.fetch,
            {},
            expect.objectContaining({
              filterResponse: true,
            }),
          )
          resolve()
        },
      })
    })

    events$.next({
      type: 'welcome',
      listenerName: 'test-listener',
    } as WelcomeEvent)
    await promise
  })

  it('filters mutation events based on transitions option', async () => {
    const events$ = new Subject<ListenEvent<SanityDocument>>()
    mockListen.mockReturnValue(events$)
    mockFetch.mockReturnValueOnce(of([mockDoc])).mockReturnValueOnce(of([mockDoc, mockDoc]))

    const results: ListenEvent<Record<string, unknown>>[] = []
    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, mockQuery, {}, {transitions: ['update']}).subscribe({
        next: (result) => {
          results.push(result as ListenEvent<Record<string, unknown>>)
          if (results.length === 2) {
            expect(results).toEqual([[mockDoc], [mockDoc, mockDoc]])
            resolve()
          }
        },
      })
    })

    events$.next({
      type: 'welcome',
      listenerName: 'test-listener',
    } as WelcomeEvent)

    // Should trigger refetch (update transition is allowed)
    events$.next(createMutationEvent('update', 'evt1', 'tx1'))
    vi.advanceTimersByTime(1000)

    // Should not trigger refetch (appear transition not in allowed list)
    events$.next(createMutationEvent('appear', 'evt2', 'tx2'))

    await promise
  })

  it('handles errors in fetch', async () => {
    const events$ = new Subject<ListenEvent<SanityDocument>>()
    mockListen.mockReturnValue(events$)
    mockFetch.mockReturnValue(throwError(() => new Error('Fetch failed')))

    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, mockQuery).subscribe({
        error: (error) => {
          expect(error.message).toBe('Fetch failed')
          resolve()
        },
      })
    })

    events$.next({
      type: 'welcome',
      listenerName: 'test-listener',
    } as WelcomeEvent)
    await promise
  })

  it('handles errors in listen stream', async () => {
    const error = new Error('Listen failed')
    mockListen.mockReturnValue(throwError(() => error))

    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, mockQuery).subscribe({
        error: (err) => {
          expect(err).toBe(error)
          resolve()
        },
      })
    })

    await promise
  })

  it('throttles subsequent fetches after mutations', async () => {
    const events$ = new Subject<ListenEvent<SanityDocument>>()
    mockListen.mockReturnValue(events$)
    mockFetch.mockReturnValue(of([mockDoc]))

    const results: ListenEvent<Record<string, unknown>>[] = []
    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, mockQuery, {}, {throttleTime: 500}).subscribe({
        next: (result) => {
          results.push(result as ListenEvent<Record<string, unknown>>)
          if (results.length === 2) {
            resolve()
          }
        },
      })
    })

    events$.next({
      type: 'welcome',
      listenerName: 'test-listener',
    } as WelcomeEvent)

    // Emit two mutations in quick succession
    events$.next(createMutationEvent('update', 'evt1', 'tx1'))
    // Emit another mutation event quickly, should be debounced
    events$.next(createMutationEvent('update', 'evt2', 'tx2'))
    vi.advanceTimersByTime(500) // Advance timer for debounceTime (using specified throttleTime)

    await promise

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('handles reconnect events', async () => {
    const events$ = new Subject<ListenEvent<SanityDocument>>()
    mockListen.mockReturnValue(events$)
    mockFetch.mockReturnValue(of([mockDoc]))

    const results: ListenEvent<Record<string, unknown>>[] = []
    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, mockQuery).subscribe({
        next: (result) => {
          results.push(result as ListenEvent<Record<string, unknown>>)
          if (results.length === 2) {
            expect(results).toEqual([[mockDoc], [mockDoc]])
            resolve()
          }
        },
      })
    })

    events$.next({
      type: 'welcome',
      listenerName: 'test-listener',
    } as WelcomeEvent)
    events$.next({type: 'reconnect'})
    vi.advanceTimersByTime(1000)

    await promise
  })

  it('rejects first non-welcome reconnect event', async () => {
    const events$ = new Subject<ListenEvent<SanityDocument>>()
    mockListen.mockReturnValue(events$)

    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, mockQuery).subscribe({
        error: (error) => {
          expect(error.message).toBe('Could not establish EventSource connection')
          resolve()
        },
      })
    })

    events$.next({type: 'reconnect'})
    await promise
  })

  it('rejects first non-welcome mutation event', async () => {
    const events$ = new Subject<ListenEvent<SanityDocument>>()
    mockListen.mockReturnValue(events$)

    const promise = new Promise<void>((resolve) => {
      listenQuery(mockClient, mockQuery).subscribe({
        error: (error) => {
          expect(error.message).toBe('Received unexpected type of first event "mutation"')
          resolve()
        },
      })
    })

    events$.next(createMutationEvent('update', 'evt1', 'tx1'))
    await promise
  })
})
