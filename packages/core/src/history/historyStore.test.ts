import {ClientError, type ListenEvent, type SanityClient, type SanityDocument} from '@sanity/client'
import {BehaviorSubject, Observable, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {getSharedListenerEvents} from '../document/documentStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {fetchDocumentsHistoryEvents, type RawDocumentHistoryEvent} from './historyClient'
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

vi.mock('../document/documentStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/documentStore')>()),
  getSharedListenerEvents: vi.fn(),
}))

vi.mock('./historyClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./historyClient')>()),
  fetchDocumentsHistoryEvents: vi.fn(),
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
    vi.mocked(fetchDocumentsHistoryEvents).mockImplementation(() => emitEventsResponse({}))

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

  it('coalesces multi-document listener mutations sharing a transactionId and ignores draft update transitions', async () => {
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

    // Intermediate draft 'update' does not produce /events/documents entries -> no reload
    listener$.next({
      type: 'mutation',
      documentId: 'drafts.doc-a',
      eventId: 'ev-1',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T11:00:00.000Z',
      transactionId: 'tx-edit-1',
      transition: 'update',
      visibility: 'query',
      effects: {apply: [], revert: []},
      previousRev: 'rev-a1',
      resultRev: 'rev-a2',
      transactionTotalEvents: 1,
      transactionCurrentEvent: 1,
    })
    expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(1)

    // Multi-document publish emits two mutations with the same transactionId -> coalesced to ONE reload
    listener$.next({
      type: 'mutation',
      documentId: 'doc-a',
      eventId: 'ev-2',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T12:00:00.000Z',
      transactionId: 'tx-publish',
      transition: 'appear',
      visibility: 'query',
      effects: {apply: [], revert: []},
      previousRev: 'rev-0',
      resultRev: 'tx-publish',
      transactionTotalEvents: 2,
      transactionCurrentEvent: 1,
    })
    listener$.next({
      type: 'mutation',
      documentId: 'doc-b',
      eventId: 'ev-3',
      identity: 'user-1',
      mutations: [],
      timestamp: '2025-05-06T12:00:00.000Z',
      transactionId: 'tx-publish',
      transition: 'appear',
      visibility: 'query',
      effects: {apply: [], revert: []},
      previousRev: 'rev-0',
      resultRev: 'tx-publish',
      transactionTotalEvents: 2,
      transactionCurrentEvent: 2,
    })

    await vi.waitFor(() => {
      expect(state.getCurrent()).toHaveLength(2)
    })
    expect(fetchDocumentsHistoryEvents).toHaveBeenCalledTimes(2)

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
})
