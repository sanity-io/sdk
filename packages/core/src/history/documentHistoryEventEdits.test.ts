import {ClientError, type SanityClient} from '@sanity/client'
import {type TransactionLogEventWithEffects} from '@sanity/types'
import {BehaviorSubject, Observable} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {documentHistoryEventEdits, isExpandableHistoryEvent} from './documentHistoryEventEdits'
import {documentTransactionRange} from './documentTransactions'
import {fetchDocumentTransactions} from './historyClient'
import {
  type DocumentHistoryCreatedEvent,
  type DocumentHistoryDiscardedEvent,
  type DocumentHistoryEvent,
  type DocumentHistoryPublishedEvent,
  type ExpandableDocumentHistoryEvent,
} from './types'

vi.mock('../client/clientStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client/clientStore')>()),
  getClientState: vi.fn(),
}))

vi.mock('./historyClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./historyClient')>()),
  fetchDocumentTransactions: vi.fn(),
}))

const DRAFT_CREATE: DocumentHistoryCreatedEvent = {
  id: 'drafts.doc-1:draft-rev-create',
  type: 'created',
  author: 'u1',
  timestamp: '2025-05-06T12:00:00.000Z',
  documentId: 'doc-1',
  variantId: 'drafts.doc-1',
  documentVariantType: 'draft',
  versionId: 'drafts.doc-1',
  versionRevisionId: 'draft-rev-create',
}

const DRAFT_PUBLISH: ExpandableDocumentHistoryEvent = {
  id: 'drafts.doc-1:draft-rev-final',
  type: 'published',
  author: 'u1',
  timestamp: '2025-05-06T12:15:00.000Z',
  documentId: 'doc-1',
  variantId: 'drafts.doc-1',
  documentVariantType: 'draft',
  revisionId: 'pub-1',
  versionId: 'drafts.doc-1',
  versionRevisionId: 'draft-rev-final',
  publishCause: 'document.publish',
  creationEvent: DRAFT_CREATE,
}

const RELEASE_PUBLISH: ExpandableDocumentHistoryEvent = {
  id: 'doc-1:pub-release-1',
  type: 'published',
  author: 'u1',
  timestamp: '2025-05-06T13:00:00.000Z',
  documentId: 'doc-1',
  variantId: 'doc-1',
  documentVariantType: 'published',
  revisionId: 'pub-release-1',
  releaseId: 'rSummer',
  versionId: 'versions.rSummer.doc-1',
  versionRevisionId: 'ver-rev-final',
  publishCause: 'release.publish',
}

describe('isExpandableHistoryEvent', () => {
  it('returns true for draft published/discarded events with versionRevisionId and creationEvent', () => {
    const draftDiscard: DocumentHistoryDiscardedEvent = {
      id: 'drafts.doc-1:draft-rev-del',
      type: 'discarded',
      author: 'u1',
      timestamp: '2025-05-06T12:10:00.000Z',
      documentId: 'doc-1',
      variantId: 'drafts.doc-1',
      documentVariantType: 'draft',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'draft-rev-del',
      creationEvent: DRAFT_CREATE,
    }

    expect(isExpandableHistoryEvent(DRAFT_PUBLISH)).toBe(true)
    expect(isExpandableHistoryEvent(draftDiscard)).toBe(true)
  })

  it('returns true for release version publish/discard events even without creationEvent', () => {
    expect(isExpandableHistoryEvent(RELEASE_PUBLISH)).toBe(true)
  })

  it('returns false for draft events missing creationEvent, missing versionRevisionId, or non-lifecycle types', () => {
    const draftPublishWithoutCreate: DocumentHistoryPublishedEvent = {
      ...DRAFT_PUBLISH,
      creationEvent: undefined,
    }
    const publishWithoutVersionRev: DocumentHistoryPublishedEvent = {
      ...RELEASE_PUBLISH,
      versionRevisionId: undefined,
    }
    const edited: DocumentHistoryEvent = {
      id: 'drafts.doc-1:edit-1',
      type: 'edited',
      author: 'u1',
      timestamp: '2025-05-06T12:05:00.000Z',
      documentId: 'doc-1',
      variantId: 'drafts.doc-1',
      documentVariantType: 'draft',
      revisionId: 'edit-1',
      contributors: ['u1'],
      transactions: [
        {
          type: 'editTransaction',
          author: 'u1',
          timestamp: '2025-05-06T12:05:00.000Z',
          revisionId: 'edit-1',
        },
      ],
    }

    expect(isExpandableHistoryEvent(undefined)).toBe(false)
    expect(isExpandableHistoryEvent(draftPublishWithoutCreate)).toBe(false)
    expect(isExpandableHistoryEvent(publishWithoutVersionRev)).toBe(false)
    expect(isExpandableHistoryEvent(DRAFT_CREATE)).toBe(false)
    expect(isExpandableHistoryEvent(edited)).toBe(false)
  })
})

describe('documentHistoryEventEdits', () => {
  let instance: SanityInstance

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'proj-1', dataset: 'production'})

    const clientSubject = new BehaviorSubject<SanityClient>({} as SanityClient)
    vi.mocked(getClientState).mockReturnValue({
      getCurrent: () => clientSubject.getValue(),
      subscribe: (cb?: () => void) => {
        const sub = clientSubject.subscribe(() => cb?.())
        return () => sub.unsubscribe()
      },
      observable: clientSubject.asObservable(),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('fetches and synthesizes draft lifecycle edits with previousRevisionId and trailing creationEvent', async () => {
    const transactions: TransactionLogEventWithEffects[] = [
      {
        id: 'draft-rev-1',
        author: 'u2',
        timestamp: '2025-05-06T12:02:00.000Z',
        documentIDs: ['drafts.doc-1'],
        effects: {'drafts.doc-1': {apply: [1, 'a'], revert: [1, 'b']}},
      },
      {
        id: 'draft-rev-2',
        author: 'u1',
        timestamp: '2025-05-06T12:10:00.000Z',
        documentIDs: ['drafts.doc-1'],
        effects: {'drafts.doc-1': {apply: [1, 'c'], revert: [1, 'a']}},
      },
    ]

    vi.mocked(fetchDocumentTransactions).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next(transactions)
        sub.complete()
      }),
    )

    const items = await documentHistoryEventEdits.resolveState(instance, {event: DRAFT_PUBLISH})

    expect(fetchDocumentTransactions).toHaveBeenCalledWith(expect.anything(), {
      variantId: 'drafts.doc-1',
      fromTransaction: 'draft-rev-create',
      toTransaction: 'draft-rev-final',
    })

    expect(items).toEqual([
      expect.objectContaining({
        type: 'edited',
        id: 'drafts.doc-1:draft-rev-2',
        documentId: 'doc-1',
        variantId: 'drafts.doc-1',
        revisionId: 'draft-rev-2',
        previousRevisionId: 'draft-rev-1',
      }),
      expect.objectContaining({
        type: 'edited',
        id: 'drafts.doc-1:draft-rev-1',
        documentId: 'doc-1',
        variantId: 'drafts.doc-1',
        revisionId: 'draft-rev-1',
        previousRevisionId: 'draft-rev-create',
      }),
      DRAFT_CREATE,
    ])
  })

  it('expands published release versions without creationEvent and synthesizes the creation boundary from transactions', async () => {
    const transactions: TransactionLogEventWithEffects[] = [
      {
        id: 'ver-rev-create',
        author: 'u1',
        timestamp: '2025-05-06T12:30:00.000Z',
        documentIDs: ['versions.rSummer.doc-1'],
        effects: {'versions.rSummer.doc-1': {apply: [1, 'init'], revert: [0, null]}},
      },
      {
        id: 'ver-rev-mid',
        author: 'u2',
        timestamp: '2025-05-06T12:40:00.000Z',
        documentIDs: ['versions.rSummer.doc-1'],
        effects: {'versions.rSummer.doc-1': {apply: [1, 'mid'], revert: [1, 'init']}},
      },
    ]

    vi.mocked(fetchDocumentTransactions).mockReturnValueOnce(
      new Observable((sub) => {
        sub.next(transactions)
        sub.complete()
      }),
    )

    const items = await documentHistoryEventEdits.resolveState(instance, {event: RELEASE_PUBLISH})

    expect(fetchDocumentTransactions).toHaveBeenCalledWith(expect.anything(), {
      variantId: 'versions.rSummer.doc-1',
      fromTransaction: undefined,
      toTransaction: 'ver-rev-final',
    })

    expect(items).toEqual([
      expect.objectContaining({
        type: 'edited',
        id: 'versions.rSummer.doc-1:ver-rev-mid',
        documentId: 'doc-1',
        variantId: 'versions.rSummer.doc-1',
        documentVariantType: 'version',
        revisionId: 'ver-rev-mid',
        previousRevisionId: 'ver-rev-create',
      }),
      expect.objectContaining({
        type: 'created',
        id: 'versions.rSummer.doc-1:ver-rev-create',
        documentId: 'doc-1',
        variantId: 'versions.rSummer.doc-1',
        documentVariantType: 'version',
        versionId: 'versions.rSummer.doc-1',
        versionRevisionId: 'ver-rev-create',
        releaseId: 'rSummer',
      }),
    ])
  })

  it('shares the immutable documentTransactionRange cache and avoids duplicate requests', async () => {
    const transactions: TransactionLogEventWithEffects[] = [
      {
        id: 'draft-rev-mid',
        author: 'u2',
        timestamp: '2025-05-06T12:05:00.000Z',
        documentIDs: ['drafts.doc-1'],
        effects: {'drafts.doc-1': {apply: [1, 'a'], revert: [1, 'b']}},
      },
    ]

    vi.mocked(fetchDocumentTransactions).mockReturnValue(
      new Observable((sub) => {
        sub.next(transactions)
        sub.complete()
      }),
    )

    // Pre-warm via the shared transaction range fetcher (as useDocumentDiff will)
    await documentTransactionRange.resolveState(instance, {
      variantId: 'drafts.doc-1',
      fromTransaction: 'draft-rev-create',
      toTransaction: 'draft-rev-final',
    })
    expect(fetchDocumentTransactions).toHaveBeenCalledTimes(1)

    // Expanding the event reads synchronously from the shared cache with zero extra requests
    const source = documentHistoryEventEdits.getState(instance, {event: DRAFT_PUBLISH})
    const snapA = source.getCurrent()
    const snapB = source.getCurrent()
    expect(snapA).toBe(snapB)
    expect(snapA.status).toBe('success')
    if (snapA.status === 'success') {
      expect(snapA.data.map((e) => e.id)).toEqual([
        'drafts.doc-1:draft-rev-mid',
        'drafts.doc-1:draft-rev-create',
      ])
    }
    expect(fetchDocumentTransactions).toHaveBeenCalledTimes(1)

    // Refetch forces a fresh read
    await documentHistoryEventEdits.refetch(instance, {event: DRAFT_PUBLISH})
    expect(fetchDocumentTransactions).toHaveBeenCalledTimes(2)
  })

  it('throws synchronously when given a non-expandable event and surfaces client errors', async () => {
    const invalidEvent = {
      ...DRAFT_PUBLISH,
      creationEvent: undefined,
    } as ExpandableDocumentHistoryEvent
    expect(() => documentHistoryEventEdits.getState(instance, {event: invalidEvent})).toThrow(
      /cannot be expanded/,
    )

    const forbidden = new ClientError({
      statusCode: 403,
      headers: {},
      body: {message: 'Forbidden'},
    })
    vi.mocked(fetchDocumentTransactions).mockReturnValueOnce(
      new Observable((sub) => {
        sub.error(forbidden)
      }),
    )

    await expect(
      documentHistoryEventEdits.resolveState(instance, {event: DRAFT_PUBLISH}),
    ).rejects.toBe(forbidden)
  })
})
