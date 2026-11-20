import {ClientError, type ListenEvent, type SanityClient, type SanityDocument} from '@sanity/client'
import {type TransactionLogEventWithEffects} from '@sanity/types'
import {BehaviorSubject, Observable, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {getSharedListenerEvents} from '../document/documentStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  fetchDocumentHistoryEvents,
  fetchDocumentTransactions,
  type RawDocumentHistoryEvent,
} from './historyClient'
import {
  expandDocumentHistoryEvent,
  getDocumentHistoryErrorState,
  getDocumentHistoryHasMoreState,
  getDocumentHistoryState,
  loadMoreDocumentHistory,
  refetchDocumentHistory,
  resolveDocumentHistory,
} from './historyStore'

vi.mock('../client/clientStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client/clientStore')>()),
  getClientState: vi.fn(),
}))

vi.mock('../document/documentStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/documentStore')>()),
  getSharedListenerEvents: vi.fn(),
}))

vi.mock('./historyClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./historyClient')>()),
  fetchDocumentHistoryEvents: vi.fn(),
  fetchDocumentTransactions: vi.fn(),
}))

const HANDLE = {
  documentId: 'doc-1',
  documentType: 'article',
}

describe('historyStore', () => {
  let instance: SanityInstance
  let listener$: Subject<ListenEvent<SanityDocument>>
  let client$: BehaviorSubject<SanityClient>

  beforeEach(() => {
    vi.clearAllMocks()
    listener$ = new Subject<ListenEvent<SanityDocument>>()
    const mockClient = {} as SanityClient
    client$ = new BehaviorSubject<SanityClient>(mockClient)

    vi.mocked(getClientState).mockReturnValue({
      observable: client$,
      getCurrent: () => mockClient,
      subscribe: () => () => {},
    } as StateSource<SanityClient>)

    vi.mocked(getSharedListenerEvents).mockReturnValue(listener$.asObservable())
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValue(
      new Observable((subscriber) => {
        subscriber.next({events: [], nextCursor: ''})
        subscriber.complete()
      }),
    )
    vi.mocked(fetchDocumentTransactions).mockReturnValue(
      new Observable((subscriber) => {
        subscriber.next([])
        subscriber.complete()
      }),
    )

    instance = createSanityInstance({projectId: 'proj-1', dataset: 'production'})
  })

  afterEach(() => {
    vi.useRealTimers()
    instance.dispose()
  })

  it('loads draft events, synthesizes edits from baseline revision, and maintains WeakMap array stability', async () => {
    const rawPublish: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-1',
      revisionId: 'pub-rev-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'draft-rev-2',
      publishCause: 'document.publish',
      author: 'user-1',
      timestamp: '2025-05-06T12:10:00.000Z',
    }
    const rawCreate: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'draft-rev-1',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }
    const postPublishTx: TransactionLogEventWithEffects = {
      id: 'draft-rev-3',
      author: 'user-2',
      timestamp: '2025-05-06T12:15:00.000Z',
      documentIDs: ['drafts.doc-1'],
      effects: {'drafts.doc-1': {apply: [1, 'next'], revert: [1, 'prev']}},
    }

    vi.mocked(fetchDocumentHistoryEvents).mockReturnValue(
      new Observable((sub) => {
        sub.next({events: [rawPublish, rawCreate], nextCursor: ''})
        sub.complete()
      }),
    )
    vi.mocked(fetchDocumentTransactions).mockReturnValue(
      new Observable((sub) => {
        sub.next([postPublishTx])
        sub.complete()
      }),
    )

    const historySource = getDocumentHistoryState(instance, HANDLE)
    const unsub = historySource.subscribe()

    await vi.waitFor(() => expect(historySource.getCurrent()).toBeDefined())

    expect(fetchDocumentHistoryEvents).toHaveBeenCalledWith(expect.anything(), {
      variantId: 'drafts.doc-1',
      limit: 100,
    })
    expect(fetchDocumentTransactions).toHaveBeenCalledWith(expect.anything(), {
      variantId: 'drafts.doc-1',
      fromTransaction: 'draft-rev-2',
    })

    const firstRead = historySource.getCurrent()!
    const secondRead = historySource.getCurrent()!
    expect(firstRead).toBe(secondRead)
    expect(firstRead.map((e) => e.type)).toEqual([
      'editDocumentVersion',
      'publishDocumentVersion',
      'createDocumentVersion',
    ])

    unsub()
  })

  it('skips transaction log fetches for published perspective or includeEditEvents: false', async () => {
    const events = await resolveDocumentHistory(instance, {
      ...HANDLE,
      perspective: 'published',
    })
    expect(events).toEqual([])
    expect(fetchDocumentTransactions).not.toHaveBeenCalled()

    await resolveDocumentHistory(instance, {
      ...HANDLE,
      includeEditEvents: false,
    })
    expect(fetchDocumentTransactions).not.toHaveBeenCalled()
  })

  it('appends live draft update mutations in memory and reloads on lifecycle mutations while preserving nextCursor and baselineRevisionId', async () => {
    const rawCreate: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'rev-base',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next({events: [rawCreate], nextCursor: 'cursor-older'})
        sub.complete()
      }),
    )

    const historySource = getDocumentHistoryState(instance, HANDLE)
    const hasMoreSource = getDocumentHistoryHasMoreState(instance, HANDLE)
    const unsub = historySource.subscribe()

    await vi.waitFor(() => expect(historySource.getCurrent()).toHaveLength(1))
    expect(hasMoreSource.getCurrent()).toBe(true)

    vi.mocked(fetchDocumentHistoryEvents).mockClear()
    vi.mocked(fetchDocumentTransactions).mockClear()

    // Live edit on watched draft: synthesized in memory with zero HTTP calls
    listener$.next({
      type: 'mutation',
      documentId: 'drafts.doc-1',
      eventId: 'ev-1',
      identity: 'user-live',
      mutations: [],
      resultRev: 'rev-live-1',
      transactionId: 'tx-live-1',
      transactionTotalEvents: 1,
      transactionCurrentEvent: 1,
      timestamp: '2025-05-06T12:02:00.000Z',
      transition: 'update',
      visibility: 'query',
    })

    const afterFirstLive = historySource.getCurrent()!
    expect(afterFirstLive.map((e) => e.type)).toEqual([
      'editDocumentVersion',
      'createDocumentVersion',
    ])
    expect(fetchDocumentHistoryEvents).not.toHaveBeenCalled()
    expect(fetchDocumentTransactions).not.toHaveBeenCalled()

    // Second live edit within 5 minutes merges into the same editDocumentVersion group
    listener$.next({
      type: 'mutation',
      documentId: 'drafts.doc-1',
      eventId: 'ev-2',
      identity: 'user-live-2',
      mutations: [],
      resultRev: 'rev-live-2',
      transactionId: 'tx-live-2',
      transactionTotalEvents: 1,
      transactionCurrentEvent: 1,
      timestamp: '2025-05-06T12:04:00.000Z',
      transition: 'update',
      visibility: 'query',
    })

    const afterSecondLive = historySource.getCurrent()!
    expect(afterSecondLive).toHaveLength(2)
    expect(afterSecondLive[0]).toMatchObject({
      type: 'editDocumentVersion',
      revisionId: 'rev-live-2',
      contributors: ['user-live-2', 'user-live'],
    })

    // Reload returns 10 delete events with no baseline -> reuses stored 'rev-base' and keeps 'cursor-older'
    const rawDiscard: RawDocumentHistoryEvent = {
      type: 'deleteDocumentVersion',
      documentId: 'doc-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'rev-live-2',
      author: 'user-1',
      timestamp: '2025-05-06T12:06:00.000Z',
    }
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next({events: [rawDiscard], nextCursor: ''})
        sub.complete()
      }),
    )

    listener$.next({
      type: 'mutation',
      documentId: 'doc-1',
      eventId: 'ev-pub',
      identity: 'user-1',
      mutations: [],
      resultRev: 'pub-rev',
      transactionId: 'tx-pub',
      transactionTotalEvents: 1,
      transactionCurrentEvent: 1,
      timestamp: '2025-05-06T12:06:00.000Z',
      transition: 'appear',
      visibility: 'query',
    })

    await vi.waitFor(() =>
      expect(historySource.getCurrent()?.some((e) => e.type === 'deleteDocumentVersion')).toBe(
        true,
      ),
    )

    expect(fetchDocumentHistoryEvents).toHaveBeenCalledWith(expect.anything(), {
      variantId: 'drafts.doc-1',
      limit: 10,
    })
    // Reused stored 'rev-base' rather than falling back to ''!
    expect(fetchDocumentTransactions).toHaveBeenCalledWith(expect.anything(), {
      variantId: 'drafts.doc-1',
      fromTransaction: 'rev-base',
    })
    // Preserved 'cursor-older' even though reload response had nextCursor: ''
    expect(hasMoreSource.getCurrent()).toBe(true)

    unsub()
  })

  it('paginates with loadMoreDocumentHistory and preserves events + nextCursor on transient failure', async () => {
    const page1Event: RawDocumentHistoryEvent = {
      type: 'updateLiveDocument',
      documentId: 'doc-1',
      revisionId: 'rev-2',
      author: 'u1',
      timestamp: '2025-05-06T12:10:00.000Z',
    }
    const page2Event: RawDocumentHistoryEvent = {
      type: 'createLiveDocument',
      documentId: 'doc-1',
      revisionId: 'rev-1',
      author: 'u1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }

    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next({events: [page1Event], nextCursor: 'cursor-page-2'})
        sub.complete()
      }),
    )

    const opts = {...HANDLE, perspective: 'published' as const, limit: 1}
    const historySource = getDocumentHistoryState(instance, opts)
    const hasMoreSource = getDocumentHistoryHasMoreState(instance, opts)
    const errorSource = getDocumentHistoryErrorState(instance, opts)
    const unsub = historySource.subscribe()

    await vi.waitFor(() => expect(historySource.getCurrent()).toHaveLength(1))
    expect(hasMoreSource.getCurrent()).toBe(true)

    // Fail loadMore once
    const badRequest = new ClientError({
      statusCode: 400,
      headers: {},
      body: {message: 'Cursor temporarily unavailable'},
    })
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.error(badRequest)
      }),
    )

    await expect(loadMoreDocumentHistory(instance, opts)).rejects.toBe(badRequest)
    expect(historySource.getCurrent()).toHaveLength(1)
    expect(hasMoreSource.getCurrent()).toBe(true)
    expect(errorSource.getCurrent()).toBe(badRequest)

    // Retry loadMore succeeds with preserved cursor
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next({events: [page2Event], nextCursor: ''})
        sub.complete()
      }),
    )

    await loadMoreDocumentHistory(instance, opts)
    expect(historySource.getCurrent()?.map((e) => e.id)).toEqual(['rev-2', 'rev-1'])
    expect(hasMoreSource.getCurrent()).toBe(false)
    expect(errorSource.getCurrent()).toBeUndefined()

    unsub()
  })

  it('expands publishDocumentVersion events on demand via expandDocumentHistoryEvent', async () => {
    const rawPublish: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-1',
      revisionId: 'pub-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'draft-rev-final',
      publishCause: 'document.publish',
      author: 'u1',
      timestamp: '2025-05-06T12:10:00.000Z',
    }
    const rawCreate: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'draft-rev-create',
      author: 'u1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }

    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next({events: [rawPublish, rawCreate], nextCursor: ''})
        sub.complete()
      }),
    )

    const historySource = getDocumentHistoryState(instance, HANDLE)
    const unsub = historySource.subscribe()

    await vi.waitFor(() => expect(historySource.getCurrent()).toHaveLength(2))

    const publishEvent = historySource.getCurrent()![0]!
    vi.mocked(fetchDocumentTransactions).mockClear()
    vi.mocked(fetchDocumentTransactions).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next([
          {
            id: 'draft-rev-mid',
            author: 'u2',
            timestamp: '2025-05-06T12:05:00.000Z',
            documentIDs: ['drafts.doc-1'],
            effects: {'drafts.doc-1': {apply: [1, 'a'], revert: [1, 'b']}},
          },
        ])
        sub.complete()
      }),
    )

    await expandDocumentHistoryEvent(instance, HANDLE, publishEvent.id)

    expect(fetchDocumentTransactions).toHaveBeenCalledWith(expect.anything(), {
      variantId: 'drafts.doc-1',
      fromTransaction: 'draft-rev-create',
      toTransaction: 'draft-rev-final',
    })

    const expanded = historySource.getCurrent()!
    expect(expanded.map((e) => e.type)).toEqual([
      'publishDocumentVersion',
      'editDocumentVersion',
      'createDocumentVersion',
    ])
    expect(expanded[1]).toMatchObject({
      type: 'editDocumentVersion',
      id: 'draft-rev-mid',
      parentId: publishEvent.id,
    })

    // Second call is a no-op
    await expandDocumentHistoryEvent(instance, HANDLE, publishEvent.id)
    expect(fetchDocumentTransactions).toHaveBeenCalledTimes(1)

    unsub()
  })

  it('supports AbortSignal in resolveDocumentHistory and cleans up entries after unsubscribe delay', async () => {
    vi.useFakeTimers()

    // Never-settling initial fetch to verify abort cancellation
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(new Observable(() => {}))

    const controller = new AbortController()
    const promise = resolveDocumentHistory(instance, {
      ...HANDLE,
      signal: controller.signal,
    })

    controller.abort()
    await expect(promise).rejects.toMatchObject({name: 'AbortError'})

    // Subsequent normal subscribe fetches fresh and cleans up 5000ms after unsubscribe
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValue(
      new Observable((sub) => {
        sub.next({events: [], nextCursor: ''})
        sub.complete()
      }),
    )

    const source = getDocumentHistoryState(instance, HANDLE)
    const unsub = source.subscribe()
    await vi.waitFor(() => expect(source.getCurrent()).toEqual([]))

    unsub()
    await vi.advanceTimersByTimeAsync(5000)
    expect(source.getCurrent()).toBeUndefined()
  })

  it('throws initial load errors before content arrives and refetches cleanly via refetchDocumentHistory', async () => {
    const forbidden = new ClientError({
      statusCode: 403,
      headers: {},
      body: {message: 'Forbidden'},
    })
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.error(forbidden)
      }),
    )

    const source = getDocumentHistoryState(instance, {...HANDLE, perspective: 'published'})
    const unsub = source.subscribe()

    await vi.waitFor(() => expect(() => source.getCurrent()).toThrow(forbidden))

    // Recover via refetchDocumentHistory
    vi.mocked(fetchDocumentHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next({
          events: [
            {
              type: 'createLiveDocument',
              documentId: 'doc-1',
              revisionId: 'rev-ok',
              author: 'u1',
              timestamp: '2025-05-06T12:00:00.000Z',
            },
          ],
          nextCursor: '',
        })
        sub.complete()
      }),
    )

    await refetchDocumentHistory(instance, {...HANDLE, perspective: 'published'})
    expect(source.getCurrent()?.map((e) => e.id)).toEqual(['rev-ok'])

    unsub()
  })
})
