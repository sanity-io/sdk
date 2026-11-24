import {ClientError, type SanityClient} from '@sanity/client'
import {type TransactionLogEventWithEffects} from '@sanity/types'
import {BehaviorSubject, Observable, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {type DocumentChangeEvent, observeDocumentChanges} from '../document/documentChangeSource'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  type ActiveVariantTransactionsResult,
  fetchActiveVariantTransactions,
  fetchDocumentsHistoryEvents,
  type RawDocumentHistoryEvent,
} from './historyClient'
import {
  getDocumentsHistoryErrorState,
  getDocumentsHistoryHasMoreState,
  getDocumentsHistoryState,
  loadMoreDocumentsHistory,
  refetchDocumentsHistory,
  resolveDocumentsHistory,
} from './historyStore'

vi.mock('../client/clientStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client/clientStore')>()),
  getClientState: vi.fn(),
}))

vi.mock('../document/documentChangeSource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/documentChangeSource')>()),
  observeDocumentChanges: vi.fn(),
}))

vi.mock('./historyClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./historyClient')>()),
  fetchDocumentsHistoryEvents: vi.fn(),
  fetchActiveVariantTransactions: vi.fn(),
}))

const DOC_A = {documentId: 'doc-a', documentType: 'article'}
const DOC_B = {documentId: 'doc-b', documentType: 'article'}

function emitEventsResponse(
  eventsByVariant: Record<string, RawDocumentHistoryEvent[]>,
  nextCursor = '',
) {
  return new Observable<{
    eventsByVariant: Record<string, RawDocumentHistoryEvent[]>
    nextCursor: string
  }>((sub) => {
    sub.next({eventsByVariant, nextCursor})
    sub.complete()
  })
}

function makeEditTx(
  id: string,
  variantId: string,
  author: string,
  timestamp: string,
): TransactionLogEventWithEffects {
  return {
    id,
    author,
    timestamp,
    documentIDs: [variantId],
    effects: {[variantId]: {apply: [1, id], revert: [1, 'prev']}},
  }
}

describe('historyStore', () => {
  let instance: SanityInstance
  let changes$: Subject<DocumentChangeEvent>
  let client$: BehaviorSubject<SanityClient>

  beforeEach(() => {
    vi.clearAllMocks()
    changes$ = new Subject<DocumentChangeEvent>()
    const mockClient = {} as SanityClient
    client$ = new BehaviorSubject<SanityClient>(mockClient)

    vi.mocked(getClientState).mockReturnValue({
      observable: client$,
      getCurrent: () => mockClient,
      subscribe: () => () => {},
    } as StateSource<SanityClient>)

    vi.mocked(observeDocumentChanges).mockReturnValue(changes$.asObservable())
    vi.mocked(fetchDocumentsHistoryEvents).mockImplementation(() => emitEventsResponse({}))
    vi.mocked(fetchActiveVariantTransactions).mockImplementation(() => of({}))

    instance = createSanityInstance({projectId: 'proj-1', dataset: 'production'})
  })

  afterEach(() => {
    vi.useRealTimers()
    instance.dispose()
  })

  it('short-circuits synchronously with empty arrays when documents is empty', async () => {
    const state = getDocumentsHistoryState(instance, {documents: []})
    const hasMore = getDocumentsHistoryHasMoreState(instance, {documents: []})
    const error = getDocumentsHistoryErrorState(instance, {documents: []})

    expect(state.getCurrent()).toEqual([])
    expect(hasMore.getCurrent()).toBe(false)
    expect(error.getCurrent()).toBeUndefined()
    await expect(resolveDocumentsHistory(instance, {documents: []})).resolves.toEqual([])
    await expect(loadMoreDocumentsHistory(instance, {documents: []})).resolves.toBeUndefined()
    await expect(refetchDocumentsHistory(instance, {documents: []})).resolves.toBeUndefined()
    expect(fetchDocumentsHistoryEvents).not.toHaveBeenCalled()
    expect(getClientState).not.toHaveBeenCalled()
  })

  it('loads merged multi-document events, folds draft lifecycles per variant, and preserves WeakMap array stability', async () => {
    const rawPublishA: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-a',
      revisionId: 'shared-rev-1',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'draft-a-2',
      publishCause: 'document.publish',
      author: 'user-1',
      timestamp: '2025-05-06T12:10:00.000Z',
    }
    const rawCreateA: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'draft-a-1',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }
    const rawPublishB: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-b',
      revisionId: 'shared-rev-1',
      versionId: 'drafts.doc-b',
      versionRevisionId: 'draft-b-1',
      publishCause: 'release.publish',
      releaseId: 'rSummer',
      author: 'user-2',
      timestamp: '2025-05-06T12:10:00.000Z',
    }

    vi.mocked(fetchDocumentsHistoryEvents).mockReturnValueOnce(
      emitEventsResponse({
        'drafts.doc-a': [rawPublishA, rawCreateA],
        'doc-b': [rawPublishB],
      }),
    )

    const options = {
      documents: [DOC_A, {...DOC_B, perspective: 'published' as const}],
    }
    const stateSource = getDocumentsHistoryState(instance, options)
    const unsubscribe = stateSource.subscribe(() => {})

    await vi.waitFor(() => {
      expect(stateSource.getCurrent()).toBeDefined()
    })

    const firstRead = stateSource.getCurrent()
    const secondRead = stateSource.getCurrent()
    expect(firstRead).toBe(secondRead)

    expect(firstRead).toHaveLength(2)
    expect(firstRead?.[0]).toMatchObject({
      id: 'doc-b:shared-rev-1',
      type: 'published',
      documentId: 'doc-b',
      variantId: 'doc-b',
      documentVariantType: 'published',
    })
    expect(firstRead?.[1]).toMatchObject({
      id: 'drafts.doc-a:draft-a-2',
      type: 'published',
      documentId: 'doc-a',
      variantId: 'drafts.doc-a',
      documentVariantType: 'draft',
      creationEvent: {
        id: 'drafts.doc-a:draft-a-1',
        variantId: 'drafts.doc-a',
        versionRevisionId: 'draft-a-1',
      },
    })

    unsubscribe()
  })

  it('shares a single cache entry regardless of document handle order and keeps multi-doc entries isolated from single-doc entries', async () => {
    const rawA: RawDocumentHistoryEvent = {
      type: 'createLiveDocument',
      documentId: 'doc-a',
      revisionId: 'rev-a',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }
    const rawB: RawDocumentHistoryEvent = {
      type: 'createLiveDocument',
      documentId: 'doc-b',
      revisionId: 'rev-b',
      author: 'user-2',
      timestamp: '2025-05-06T11:00:00.000Z',
    }

    vi.mocked(fetchDocumentsHistoryEvents)
      .mockReturnValueOnce(emitEventsResponse({'doc-a': [rawA], 'doc-b': []}, 'cursor-page-2'))
      .mockReturnValueOnce(emitEventsResponse({'doc-b': [rawB]}))

    const pubA = {...DOC_A, perspective: 'published' as const}
    const pubB = {...DOC_B, perspective: 'published' as const}

    const abSource = getDocumentsHistoryState(instance, {documents: [pubA, pubB]})
    const baSource = getDocumentsHistoryState(instance, {documents: [pubB, pubA]})
    const unsubAB = abSource.subscribe(() => {})
    const unsubBA = baSource.subscribe(() => {})

    await vi.waitFor(() => {
      expect(abSource.getCurrent()).toHaveLength(1)
    })
    expect(baSource.getCurrent()).toBe(abSource.getCurrent())
    expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(1)

    // Standalone doc-b has its own cache entry and is NOT polluted by the empty page-1 slice in [docA, docB]
    const bSource = getDocumentsHistoryState(instance, {documents: [pubB]})
    const unsubB = bSource.subscribe(() => {})
    await vi.waitFor(() => {
      expect(bSource.getCurrent()).toHaveLength(1)
    })
    expect(bSource.getCurrent()?.[0]?.documentId).toBe('doc-b')
    expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(2)

    unsubAB()
    unsubBA()
    unsubB()
  })

  it('paginates with loadMore, deduplicates concurrent requests, and preserves cursor on error', async () => {
    const page1Event: RawDocumentHistoryEvent = {
      type: 'createLiveDocument',
      documentId: 'doc-a',
      revisionId: 'rev-2',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }
    const page2Event: RawDocumentHistoryEvent = {
      type: 'createLiveDocument',
      documentId: 'doc-a',
      revisionId: 'rev-1',
      author: 'user-1',
      timestamp: '2025-05-06T11:00:00.000Z',
    }

    const page2Deferred = new Subject<{
      eventsByVariant: Record<string, RawDocumentHistoryEvent[]>
      nextCursor: string
    }>()

    vi.mocked(fetchDocumentsHistoryEvents)
      .mockReturnValueOnce(emitEventsResponse({'doc-a': [page1Event]}, 'cursor-1'))
      .mockReturnValueOnce(
        new Observable((sub) => {
          sub.error(new Error('loadMore failed'))
        }),
      )
      .mockReturnValueOnce(page2Deferred.asObservable())

    const options = {documents: [{...DOC_A, perspective: 'published' as const}]}
    const state = getDocumentsHistoryState(instance, options)
    const hasMore = getDocumentsHistoryHasMoreState(instance, options)
    const error = getDocumentsHistoryErrorState(instance, options)
    const unsub = state.subscribe(() => {})

    await vi.waitFor(() => {
      expect(state.getCurrent()).toHaveLength(1)
      expect(hasMore.getCurrent()).toBe(true)
    })

    // First loadMore fails -> preserves existing events and nextCursor
    await expect(loadMoreDocumentsHistory(instance, options)).rejects.toThrow('loadMore failed')
    expect(state.getCurrent()).toHaveLength(1)
    expect(hasMore.getCurrent()).toBe(true)
    expect(error.getCurrent()).toBeInstanceOf(Error)

    // Concurrent loadMore calls for the same cursor share one request
    const p1 = loadMoreDocumentsHistory(instance, options)
    const p2 = loadMoreDocumentsHistory(instance, options)
    expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(3)

    page2Deferred.next({eventsByVariant: {'doc-a': [page2Event]}, nextCursor: ''})
    page2Deferred.complete()
    await Promise.all([p1, p2])

    expect(state.getCurrent()?.map((e) => e.id)).toEqual(['doc-a:rev-2', 'doc-a:rev-1'])
    expect(hasMore.getCurrent()).toBe(false)
    expect(error.getCurrent()).toBeUndefined()

    unsub()
  })

  it('coalesces multi-document listener mutations sharing a transactionId and appends draft update transitions in memory', async () => {
    const initialA: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'rev-a1',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00.000Z',
    }
    const publishedA: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-a',
      revisionId: 'tx-publish',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'rev-a2',
      publishCause: 'release.publish',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }
    const publishedB: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-b',
      revisionId: 'tx-publish',
      versionId: 'drafts.doc-b',
      versionRevisionId: 'rev-b2',
      publishCause: 'release.publish',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00.000Z',
    }

    vi.mocked(fetchDocumentsHistoryEvents)
      .mockReturnValueOnce(emitEventsResponse({'drafts.doc-a': [initialA], 'drafts.doc-b': []}))
      .mockReturnValueOnce(
        emitEventsResponse({
          'drafts.doc-a': [publishedA, initialA],
          'drafts.doc-b': [publishedB],
        }),
      )

    const options = {documents: [DOC_A, DOC_B]}
    const state = getDocumentsHistoryState(instance, options)
    const unsub = state.subscribe(() => {})

    await vi.waitFor(() => {
      expect(state.getCurrent()).toHaveLength(1)
    })

    // Initial connected signal does not trigger a redundant reload
    changes$.next({type: 'connected'})
    expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(1)

    // Intermediate draft 'update' appends a live edited event in memory without reloading /events
    changes$.next({
      type: 'mutation',
      documentId: 'drafts.doc-a',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T11:00:00.000Z',
      transactionId: 'tx-edit-1',
      transition: 'update',
      previousRev: 'rev-a1',
      resultRev: 'rev-a2',
    })
    expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(1)
    expect(state.getCurrent()?.map((e) => `${e.type}:${e.id}`)).toEqual([
      'edited:drafts.doc-a:rev-a2',
      'created:drafts.doc-a:rev-a1',
    ])

    // Multi-document publish emits two mutations with the same transactionId -> coalesced to ONE reload
    // and clears the temporary active edit on drafts.doc-a
    changes$.next({
      type: 'mutation',
      documentId: 'doc-a',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T12:00:00.000Z',
      transactionId: 'tx-publish',
      transition: 'appear',
      previousRev: 'rev-0',
      resultRev: 'tx-publish',
    })
    changes$.next({
      type: 'mutation',
      documentId: 'doc-b',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T12:00:00.000Z',
      transactionId: 'tx-publish',
      transition: 'appear',
      previousRev: 'rev-0',
      resultRev: 'tx-publish',
    })

    await vi.waitFor(() => {
      expect(state.getCurrent()?.map((e) => `${e.type}:${e.id}`)).toEqual([
        'published:drafts.doc-a:rev-a2',
        'published:drafts.doc-b:rev-b2',
      ])
    })
    expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(2)

    // Resync triggers a reload (and consecutive resyncs are not coalesced)
    changes$.next({type: 'resync'})
    await vi.waitFor(() => {
      expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(3)
    })

    unsub()
  })

  it('refetches latest events while preserving pagination cursor and supports aborting resolveDocumentsHistory', async () => {
    const controller = new AbortController()
    vi.mocked(fetchDocumentsHistoryEvents).mockReturnValueOnce(new Observable(() => {}))

    const pending = resolveDocumentsHistory(instance, {
      documents: [DOC_A],
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).rejects.toThrow(/aborted/i)

    const initial: RawDocumentHistoryEvent = {
      type: 'createLiveDocument',
      documentId: 'doc-a',
      revisionId: 'rev-1',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00.000Z',
    }
    const newer: RawDocumentHistoryEvent = {
      type: 'updateLiveDocument',
      documentId: 'doc-a',
      revisionId: 'rev-2',
      author: 'user-2',
      timestamp: '2025-05-06T12:00:00.000Z',
    }
    vi.mocked(fetchDocumentsHistoryEvents)
      .mockReturnValueOnce(emitEventsResponse({'doc-a': [initial]}, 'cursor-next'))
      .mockReturnValueOnce(emitEventsResponse({'doc-a': [newer]}))

    const options = {documents: [{...DOC_A, perspective: 'published' as const}]}
    const state = getDocumentsHistoryState(instance, options)
    const hasMore = getDocumentsHistoryHasMoreState(instance, options)
    const unsub = state.subscribe(() => {})

    await vi.waitFor(() => {
      expect(state.getCurrent()).toHaveLength(1)
      expect(hasMore.getCurrent()).toBe(true)
    })

    await refetchDocumentsHistory(instance, options)
    expect(state.getCurrent()?.map((e) => e.id)).toEqual(['doc-a:rev-2', 'doc-a:rev-1'])
    expect(hasMore.getCurrent()).toBe(true)

    unsub()
  })

  it('throws terminal initial-load errors from the state selector', async () => {
    const fatalError = new ClientError({
      body: {error: 'Forbidden', message: 'Not allowed', statusCode: 403},
      statusCode: 403,
      url: '/data/history/production/events/documents/doc-a',
      method: 'GET',
      headers: {},
    })
    vi.mocked(fetchDocumentsHistoryEvents).mockReturnValueOnce(
      new Observable((sub) => {
        sub.error(fatalError)
      }),
    )

    const options = {documents: [{...DOC_A, perspective: 'published' as const}]}
    const state = getDocumentsHistoryState(instance, options)
    const unsub = state.subscribe(() => {})

    await vi.waitFor(() => {
      expect(() => state.getCurrent()).toThrow(fatalError)
    })

    unsub()
  })

  it('fetches batched active edits for open drafts and release versions before resolving initial load', async () => {
    const createDraft: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'draft-create',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
    }
    const createVersion: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-b',
      versionId: 'versions.r1.doc-b',
      versionRevisionId: 'ver-create',
      releaseId: 'r1',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
    }
    const pubDoc: RawDocumentHistoryEvent = {
      type: 'createLiveDocument',
      documentId: 'doc-a',
      revisionId: 'pub-create',
      author: 'user-1',
      timestamp: '2025-05-06T09:00:00Z',
    }

    vi.mocked(fetchDocumentsHistoryEvents).mockReturnValueOnce(
      emitEventsResponse({
        'drafts.doc-a': [createDraft],
        'versions.r1.doc-b': [createVersion],
        'doc-a': [pubDoc],
      }),
    )

    const activeSubject = new Subject<Record<string, ActiveVariantTransactionsResult>>()
    vi.mocked(fetchActiveVariantTransactions).mockReturnValueOnce(activeSubject.asObservable())

    const options = {
      documents: [
        DOC_A,
        {...DOC_A, perspective: 'published' as const},
        {...DOC_B, perspective: {releaseName: 'r1'}},
      ],
    }

    const resolvePromise = resolveDocumentsHistory(instance, options)

    await vi.waitFor(() => {
      expect(fetchActiveVariantTransactions).toHaveBeenCalledTimes(1)
    })
    expect(fetchActiveVariantTransactions).toHaveBeenCalledWith(expect.anything(), [
      {variantId: 'drafts.doc-a', baselineRevisionId: 'draft-create'},
      {variantId: 'versions.r1.doc-b', baselineRevisionId: 'ver-create'},
    ])

    activeSubject.next({
      'drafts.doc-a': {
        transactions: [
          makeEditTx('draft-e1', 'drafts.doc-a', 'user-1', '2025-05-06T10:02:00.000Z'),
          makeEditTx('draft-e2', 'drafts.doc-a', 'user-2', '2025-05-06T10:04:00.000Z'),
        ],
        boundaryRevisionId: 'draft-create',
        truncated: false,
      },
      'versions.r1.doc-b': {
        transactions: [
          makeEditTx('ver-e1', 'versions.r1.doc-b', 'user-2', '2025-05-06T10:10:00.000Z'),
        ],
        boundaryRevisionId: 'ver-create',
        truncated: false,
      },
    })
    activeSubject.complete()

    const resolved = await resolvePromise
    expect(resolved.map((e) => `${e.type}:${e.id}`)).toEqual([
      'edited:versions.r1.doc-b:ver-e1',
      'edited:drafts.doc-a:draft-e2',
      'created:drafts.doc-a:draft-create',
      'created:versions.r1.doc-b:ver-create',
      'created:doc-a:pub-create',
    ])
    expect(resolved[0]).toMatchObject({
      type: 'edited',
      previousRevisionId: 'ver-create',
      contributors: ['user-2'],
    })
    expect(resolved[1]).toMatchObject({
      type: 'edited',
      previousRevisionId: 'draft-create',
      contributors: ['user-2', 'user-1'],
      transactions: [
        {revisionId: 'draft-e2', author: 'user-2'},
        {revisionId: 'draft-e1', author: 'user-1'},
      ],
    })
  })

  it('buffers live draft edits during initial load, handles multi-doc live edits, and clears old edits across rapid publish + recreate', async () => {
    const createA: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'a-create-1',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
    }
    const createB: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-b',
      versionId: 'drafts.doc-b',
      versionRevisionId: 'b-create-1',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
    }

    const initialEvents$ = new Subject<{
      eventsByVariant: Record<string, RawDocumentHistoryEvent[]>
      nextCursor: string
    }>()
    const recreateReload$ = new Subject<{
      eventsByVariant: Record<string, RawDocumentHistoryEvent[]>
      nextCursor: string
    }>()

    vi.mocked(fetchDocumentsHistoryEvents)
      .mockReturnValueOnce(initialEvents$.asObservable())
      .mockReturnValueOnce(new Observable(() => {})) // cancelled by rapid recreate
      .mockReturnValueOnce(recreateReload$.asObservable())

    const options = {documents: [DOC_A, DOC_B]}
    const state = getDocumentsHistoryState(instance, options)
    const unsub = state.subscribe(() => {})

    // Live edit arrives BEFORE initial load completes -> buffered and applied once loaded
    changes$.next({
      type: 'mutation',
      documentId: 'drafts.doc-a',
      identity: 'user-2',
      mutations: [],
      timestamp: '2025-05-06T10:02:00.000Z',
      transactionId: 'tx-buffered',
      transition: 'update',
      previousRev: 'a-create-1',
      resultRev: 'a-edit-buffered',
    })

    initialEvents$.next({
      eventsByVariant: {'drafts.doc-a': [createA], 'drafts.doc-b': [createB]},
      nextCursor: '',
    })
    initialEvents$.complete()

    await vi.waitFor(() => {
      expect(state.getCurrent()?.map((e) => `${e.type}:${e.id}`)).toContain(
        'edited:drafts.doc-a:a-edit-buffered',
      )
    })

    // Multi-doc live transaction updates BOTH watched drafts sharing the same transactionId
    changes$.next({
      type: 'mutation',
      documentId: 'drafts.doc-a',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T10:15:00.000Z',
      transactionId: 'tx-multi',
      transition: 'update',
      previousRev: 'a-edit-buffered',
      resultRev: 'tx-multi',
    })
    changes$.next({
      type: 'mutation',
      documentId: 'drafts.doc-b',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T10:15:00.000Z',
      transactionId: 'tx-multi',
      transition: 'update',
      previousRev: 'b-create-1',
      resultRev: 'tx-multi',
    })

    expect(state.getCurrent()?.map((e) => `${e.type}:${e.id}`)).toEqual(
      expect.arrayContaining(['edited:drafts.doc-a:tx-multi', 'edited:drafts.doc-b:tx-multi']),
    )

    // Rapid publish (disappear) -> recreate (appear) -> immediate edit before reload settles
    changes$.next({
      type: 'mutation',
      documentId: 'drafts.doc-a',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T10:20:00.000Z',
      transactionId: 'tx-pub-1',
      transition: 'disappear',
      previousRev: 'tx-multi',
    })
    changes$.next({
      type: 'mutation',
      documentId: 'drafts.doc-a',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T10:20:00.500Z',
      transactionId: 'a-create-2',
      transition: 'appear',
      resultRev: 'a-create-2',
    })
    changes$.next({
      type: 'mutation',
      documentId: 'drafts.doc-a',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T10:21:00.000Z',
      transactionId: 'a-edit-new',
      transition: 'update',
      previousRev: 'a-create-2',
      resultRev: 'a-edit-new',
    })

    // Same-second publish + recreate returned in server newest-first order
    const publishA: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-a',
      revisionId: 'tx-pub-1',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'tx-multi',
      publishCause: 'document.publish',
      author: 'user-1',
      timestamp: '2025-05-06T10:20:00Z',
    }
    const createA2: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'a-create-2',
      author: 'user-1',
      timestamp: '2025-05-06T10:20:00Z',
    }
    recreateReload$.next({
      eventsByVariant: {
        'drafts.doc-a': [createA2, publishA, createA],
        'drafts.doc-b': [createB],
      },
      nextCursor: '',
    })
    recreateReload$.complete()

    await vi.waitFor(() => {
      const docAEvents = state.getCurrent()?.filter((e) => e.documentId === 'doc-a')
      expect(docAEvents?.map((e) => `${e.type}:${e.id}`)).toEqual([
        'edited:drafts.doc-a:a-edit-new',
        'created:drafts.doc-a:a-create-2',
        'published:drafts.doc-a:tx-multi',
      ])
    })

    // Folded published event points at old creation (a-create-1), NOT the newer same-second create (a-create-2)
    const publishedEvent = state.getCurrent()?.find((e) => e.id === 'drafts.doc-a:tx-multi')
    expect(publishedEvent).toMatchObject({
      type: 'published',
      creationEvent: {id: 'drafts.doc-a:a-create-1'},
    })

    unsub()
  })

  it('handles unpublish on existing draft without dropping earlier edits or colliding IDs, and treats unpublish on release versions as closed', async () => {
    const unpublishDraft: RawDocumentHistoryEvent = {
      type: 'unpublishDocument',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'd3',
      author: 'user-1',
      timestamp: '2025-05-06T10:05:00Z',
    }
    const createDraft: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'd1',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
    }
    const unpublishVersion: RawDocumentHistoryEvent = {
      type: 'unpublishDocument',
      documentId: 'doc-b',
      versionId: 'versions.r1.doc-b',
      versionRevisionId: 'v2',
      releaseId: 'r1',
      author: 'user-1',
      timestamp: '2025-05-06T10:05:00Z',
    }

    vi.mocked(fetchDocumentsHistoryEvents).mockReturnValueOnce(
      emitEventsResponse({
        'drafts.doc-a': [unpublishDraft, createDraft],
        'versions.r1.doc-b': [unpublishVersion],
      }),
    )
    vi.mocked(fetchActiveVariantTransactions).mockReturnValueOnce(
      of({
        'drafts.doc-a': {
          transactions: [
            makeEditTx('d2', 'drafts.doc-a', 'user-1', '2025-05-06T10:02:00.000Z'),
            makeEditTx('d3', 'drafts.doc-a', 'user-2', '2025-05-06T10:03:00.000Z'),
          ],
          boundaryRevisionId: 'd1',
          truncated: false,
        },
      }),
    )

    const resolved = await resolveDocumentsHistory(instance, {
      documents: [DOC_A, {...DOC_B, perspective: {releaseName: 'r1'}}],
    })

    // Only drafts.doc-a is queried (baseline d1, not d3); versions.r1.doc-b is closed
    expect(fetchActiveVariantTransactions).toHaveBeenCalledWith(expect.anything(), [
      {variantId: 'drafts.doc-a', baselineRevisionId: 'd1'},
    ])

    const docAEvents = resolved.filter((e) => e.documentId === 'doc-a')
    expect(docAEvents.map((e) => `${e.type}:${e.id}`)).toEqual([
      'unpublished:drafts.doc-a:unpublish-d3',
      'edited:drafts.doc-a:d3',
      'created:drafts.doc-a:d1',
    ])
  })

  it('preserves active edits across loadMore and refreshes active edits on resync and refetch', async () => {
    const createDraft: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'd1',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00Z',
    }
    const olderPublish: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-a',
      revisionId: 'pub-old',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'd0',
      publishCause: 'document.publish',
      author: 'user-1',
      timestamp: '2025-05-06T09:00:00Z',
    }

    vi.mocked(fetchDocumentsHistoryEvents)
      .mockReturnValueOnce(emitEventsResponse({'drafts.doc-a': [createDraft]}, 'cursor-1'))
      .mockReturnValueOnce(emitEventsResponse({'drafts.doc-a': [olderPublish]}))
      .mockReturnValueOnce(emitEventsResponse({'drafts.doc-a': [createDraft]}))
      .mockReturnValueOnce(emitEventsResponse({'drafts.doc-a': [createDraft]}))

    vi.mocked(fetchActiveVariantTransactions)
      .mockReturnValueOnce(
        of({
          'drafts.doc-a': {
            transactions: [makeEditTx('d2', 'drafts.doc-a', 'user-1', '2025-05-06T12:01:00.000Z')],
            boundaryRevisionId: 'd1',
            truncated: false,
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          'drafts.doc-a': {
            transactions: [
              makeEditTx('d2', 'drafts.doc-a', 'user-1', '2025-05-06T12:01:00.000Z'),
              makeEditTx('d3', 'drafts.doc-a', 'user-2', '2025-05-06T12:10:00.000Z'),
            ],
            boundaryRevisionId: 'd1',
            truncated: false,
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          'drafts.doc-a': {
            transactions: [
              makeEditTx('d2', 'drafts.doc-a', 'user-1', '2025-05-06T12:01:00.000Z'),
              makeEditTx('d3', 'drafts.doc-a', 'user-2', '2025-05-06T12:10:00.000Z'),
              makeEditTx('d4', 'drafts.doc-a', 'user-1', '2025-05-06T12:20:00.000Z'),
            ],
            boundaryRevisionId: 'd1',
            truncated: false,
          },
        }),
      )

    const options = {documents: [DOC_A]}
    const state = getDocumentsHistoryState(instance, options)
    const unsub = state.subscribe(() => {})

    await vi.waitFor(() => {
      expect(state.getCurrent()?.map((e) => `${e.type}:${e.id}`)).toEqual([
        'edited:drafts.doc-a:d2',
        'created:drafts.doc-a:d1',
      ])
    })

    // loadMore preserves active edits without re-fetching /transactions
    await loadMoreDocumentsHistory(instance, options)
    expect(fetchActiveVariantTransactions).toHaveBeenCalledTimes(1)
    expect(state.getCurrent()?.map((e) => `${e.type}:${e.id}`)).toEqual([
      'edited:drafts.doc-a:d2',
      'created:drafts.doc-a:d1',
      'published:drafts.doc-a:d0',
    ])

    // resync refreshes active /transactions to pick up missed edits
    changes$.next({type: 'resync'})
    await vi.waitFor(() => {
      expect(state.getCurrent()?.map((e) => `${e.type}:${e.id}`)).toContain(
        'edited:drafts.doc-a:d3',
      )
    })

    // manual refetch also refreshes active /transactions
    await refetchDocumentsHistory(instance, options)
    expect(state.getCurrent()?.map((e) => `${e.type}:${e.id}`)).toContain('edited:drafts.doc-a:d4')

    unsub()
  })

  it('falls back gracefully to semantic events when active /transactions fails (e.g. 401 on public dataset)', async () => {
    const createDraft: RawDocumentHistoryEvent = {
      type: 'createDocumentVersion',
      documentId: 'doc-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'd1',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00Z',
    }
    const authError = new ClientError({
      body: {error: 'Unauthorized', message: 'Auth required', statusCode: 401},
      statusCode: 401,
      url: '/data/history/production/transactions/drafts.doc-a',
      method: 'GET',
      headers: {},
    })

    vi.mocked(fetchDocumentsHistoryEvents).mockReturnValueOnce(
      emitEventsResponse({'drafts.doc-a': [createDraft]}),
    )
    vi.mocked(fetchActiveVariantTransactions).mockReturnValueOnce(
      new Observable((sub) => {
        sub.error(authError)
      }),
    )

    const options = {documents: [DOC_A]}
    const state = getDocumentsHistoryState(instance, options)
    const error = getDocumentsHistoryErrorState(instance, options)
    const unsub = state.subscribe(() => {})

    await vi.waitFor(() => {
      expect(state.getCurrent()).toHaveLength(1)
    })
    expect(state.getCurrent()?.[0]?.id).toBe('drafts.doc-a:d1')
    expect(error.getCurrent()).toBe(authError)

    unsub()
  })
})
