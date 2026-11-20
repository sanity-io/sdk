import {type TransactionLogEventWithEffects} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {
  applyVariantTransforms,
  assignEventId,
  dedupeHistoryEvents,
  findEditEventsBaseline,
  getEditEvents,
  getEffectState,
  groupEditTransactions,
  HISTORY_CLEARED_EVENT_ID,
  mergeEditEvents,
  sortHistoryEvents,
  withHistoryClearedEvent,
} from './synthesizeEditEvents'
import {type DocumentHistoryEvent} from './types'

const BASE_TS = '2025-05-06T12:00:00.000Z'
const plusMs = (ms: number) => new Date(Date.parse(BASE_TS) + ms).toISOString()
const plusMin = (minutes: number) => plusMs(minutes * 60_000)

describe('getEffectState', () => {
  it('classifies noop, deleted, created, and modified Mendoza effects', () => {
    expect(getEffectState(undefined)).toBe('noop')
    expect(getEffectState({apply: [0, null], revert: [1, 'prev']})).toBe('deleted')
    expect(getEffectState({apply: [1, 'next'], revert: [0, null]})).toBe('created')
    expect(getEffectState({apply: [1, 'next'], revert: [1, 'prev']})).toBe('modified')
  })
})

describe('assignEventId', () => {
  it('assigns non-empty variant-aware IDs across all event types and never returns empty string', () => {
    expect(
      assignEventId(
        {
          type: 'unpublishDocument',
          documentId: 'doc-1',
          versionId: 'drafts.doc-1',
          versionRevisionId: 'vrev-unpub',
          author: 'u1',
          timestamp: BASE_TS,
        },
        'draft',
      ).id,
    ).toBe('vrev-unpub')

    expect(
      assignEventId(
        {
          type: 'unpublishDocument',
          documentId: 'doc-1',
          versionId: 'drafts.doc-1',
          versionRevisionId: '',
          author: 'u1',
          timestamp: BASE_TS,
        },
        'published',
      ).id,
    ).toBe(`unpublishAt-${BASE_TS}`)

    // Fallback when revision fields are empty
    const fallback = assignEventId(
      {
        type: 'createLiveDocument',
        documentId: 'doc-1',
        revisionId: '',
        author: 'u1',
        timestamp: BASE_TS,
      },
      'published',
    )
    expect(fallback.id).toBe(`createLiveDocument:${BASE_TS}`)
    expect(fallback.id.length).toBeGreaterThan(0)
  })
})

describe('dedupeHistoryEvents', () => {
  it('replaces synthesized edit events with semantic events sharing the same revision ID', () => {
    const edit = groupEditTransactions(
      [{type: 'editTransaction', author: 'u1', timestamp: BASE_TS, revisionId: 'rev-shared'}],
      'versions.r1.doc-1',
    )[0]!
    const deleted = assignEventId(
      {
        type: 'deleteDocumentVersion',
        documentId: 'doc-1',
        versionId: 'versions.r1.doc-1',
        versionRevisionId: 'rev-shared',
        author: 'u1',
        timestamp: plusMin(1),
      },
      'version',
    )

    const merged = dedupeHistoryEvents([edit], [deleted])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.type).toBe('deleteDocumentVersion')
  })

  it('keeps distinct semantic event types that share a revision ID with disambiguated IDs', () => {
    const created = assignEventId(
      {
        type: 'createDocumentVersion',
        documentId: 'doc-1',
        versionId: 'drafts.doc-1',
        versionRevisionId: 'rev-1',
        author: 'u1',
        timestamp: BASE_TS,
      },
      'draft',
    )
    const published = assignEventId(
      {
        type: 'publishDocumentVersion',
        documentId: 'doc-1',
        revisionId: 'pub-1',
        versionId: 'drafts.doc-1',
        versionRevisionId: 'rev-1',
        publishCause: 'document.publish',
        author: 'u1',
        timestamp: BASE_TS,
      },
      'draft',
    )

    const merged = dedupeHistoryEvents([created], [published])
    expect(merged).toHaveLength(2)
    expect(new Set(merged.map((e) => e.id)).size).toBe(2)
  })
})

describe('getEditEvents & mergeEditEvents', () => {
  const makeModifiedTx = (
    id: string,
    timestamp: string,
    author = 'u1',
  ): TransactionLogEventWithEffects => ({
    id,
    author,
    timestamp,
    documentIDs: ['drafts.doc-1'],
    effects: {
      'drafts.doc-1': {apply: [1, 'a'], revert: [1, 'b']},
    },
  })

  it('groups modified transactions within a 5-minute window anchored to the newest transaction', () => {
    const createTx: TransactionLogEventWithEffects = {
      id: 'tx-create',
      author: 'u1',
      timestamp: BASE_TS,
      documentIDs: ['drafts.doc-1'],
      effects: {'drafts.doc-1': {apply: [1, 'a'], revert: [0, null]}},
    }
    const tx1 = makeModifiedTx('tx-1', plusMin(1), 'u1')
    const tx2 = makeModifiedTx('tx-2', plusMin(4), 'u2')
    const tx3 = makeModifiedTx('tx-3', plusMin(10), 'u1')

    const editEvents = getEditEvents([createTx, tx1, tx2, tx3], 'drafts.doc-1')
    expect(editEvents).toHaveLength(2)
    expect(editEvents[0]).toMatchObject({
      id: 'tx-3',
      revisionId: 'tx-3',
      contributors: ['u1'],
    })
    expect(editEvents[1]).toMatchObject({
      id: 'tx-2',
      revisionId: 'tx-2',
      contributors: ['u2', 'u1'],
    })
    expect(editEvents[1]?.transactions.map((t) => t.revisionId)).toEqual(['tx-2', 'tx-1'])
  })

  it('regroups consecutive non-expanded edit events while preserving expanded edits with parentId', () => {
    const liveEdit = groupEditTransactions(
      [{type: 'editTransaction', author: 'u2', timestamp: plusMin(3), revisionId: 'tx-live'}],
      'drafts.doc-1',
    )[0]!
    const fetchedEdit = groupEditTransactions(
      [
        {type: 'editTransaction', author: 'u2', timestamp: plusMin(3), revisionId: 'tx-live'},
        {type: 'editTransaction', author: 'u1', timestamp: plusMin(1), revisionId: 'tx-fetched'},
      ],
      'drafts.doc-1',
    )[0]!
    const expandedEdit = {
      ...groupEditTransactions(
        [{type: 'editTransaction', author: 'u1', timestamp: BASE_TS, revisionId: 'tx-old'}],
        'drafts.doc-1',
      )[0]!,
      parentId: 'pub-1',
    }

    const merged = mergeEditEvents([liveEdit, fetchedEdit, expandedEdit])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({
      type: 'editDocumentVersion',
      revisionId: 'tx-live',
      contributors: ['u2', 'u1'],
    })
    if (merged[0]?.type === 'editDocumentVersion') {
      expect(merged[0].transactions).toHaveLength(2)
    }
    expect(merged[1]).toBe(expandedEdit)
  })
})

describe('findEditEventsBaseline & withHistoryClearedEvent', () => {
  it('uses creation event for versions and newest non-delete event for drafts', () => {
    const events: DocumentHistoryEvent[] = [
      assignEventId(
        {
          type: 'deleteDocumentVersion',
          documentId: 'doc-1',
          versionId: 'drafts.doc-1',
          versionRevisionId: 'rev-del',
          author: 'u1',
          timestamp: plusMin(10),
        },
        'draft',
      ),
      assignEventId(
        {
          type: 'publishDocumentVersion',
          documentId: 'doc-1',
          revisionId: 'pub-1',
          versionId: 'drafts.doc-1',
          versionRevisionId: 'rev-pub',
          publishCause: 'document.publish',
          author: 'u1',
          timestamp: plusMin(5),
        },
        'draft',
      ),
      assignEventId(
        {
          type: 'createDocumentVersion',
          documentId: 'doc-1',
          versionId: 'drafts.doc-1',
          versionRevisionId: 'rev-create',
          author: 'u1',
          timestamp: BASE_TS,
        },
        'draft',
      ),
    ]

    expect(findEditEventsBaseline(events, 'draft')).toBe('rev-pub')
    expect(findEditEventsBaseline(events, 'version')).toBe('rev-create')
  })

  it('prepends historyCleared 1ms before oldest edit when API events are empty', () => {
    const edits = groupEditTransactions(
      [
        {type: 'editTransaction', author: 'u1', timestamp: plusMin(10), revisionId: 'tx-2'},
        {type: 'editTransaction', author: 'u1', timestamp: BASE_TS, revisionId: 'tx-1'},
      ],
      'drafts.doc-1',
    )

    const withCleared = withHistoryClearedEvent(edits, {
      apiEvents: [],
      variantId: 'drafts.doc-1',
      variantType: 'draft',
    })

    expect(withCleared[0]).toEqual({
      id: HISTORY_CLEARED_EVENT_ID,
      type: 'historyCleared',
      documentId: 'drafts.doc-1',
      documentVariantType: 'draft',
      author: '',
      timestamp: plusMs(-1),
    })
  })
})

describe('sortHistoryEvents & applyVariantTransforms', () => {
  it('places publishDocumentVersion right before its paired edit even when second-level timestamp trails', () => {
    const publish = assignEventId(
      {
        type: 'publishDocumentVersion',
        documentId: 'doc-1',
        revisionId: 'pub-1',
        versionId: 'drafts.doc-1',
        versionRevisionId: 'tx-edit-final',
        publishCause: 'document.publish',
        author: 'u1',
        timestamp: '2025-05-06T12:00:10Z',
      },
      'draft',
    )
    const edit = {
      ...groupEditTransactions(
        [
          {
            type: 'editTransaction',
            author: 'u1',
            timestamp: '2025-05-06T12:00:10.620Z',
            revisionId: 'tx-edit-final',
          },
          {
            type: 'editTransaction',
            author: 'u1',
            timestamp: '2025-05-06T12:00:08.100Z',
            revisionId: 'tx-edit-prev',
          },
        ],
        'drafts.doc-1',
      )[0]!,
      parentId: publish.id,
    }
    const create = assignEventId(
      {
        type: 'createDocumentVersion',
        documentId: 'doc-1',
        versionId: 'drafts.doc-1',
        versionRevisionId: 'tx-create',
        author: 'u1',
        timestamp: '2025-05-06T12:00:05Z',
      },
      'draft',
    )

    const sorted = sortHistoryEvents([create, edit, publish])
    expect(sorted.map((e) => e.type)).toEqual([
      'publishDocumentVersion',
      'editDocumentVersion',
      'createDocumentVersion',
    ])

    const transformed = applyVariantTransforms(sorted, 'draft')
    // Input objects were not mutated
    expect('creationEvent' in publish).toBe(false)
    expect('parentId' in create).toBe(false)

    // Transformed publish has creationEvent, draft documentId, and disambiguated child edit ID
    expect(transformed[0]).toMatchObject({
      type: 'publishDocumentVersion',
      id: 'tx-edit-final',
      documentId: 'drafts.doc-1',
      creationEvent: expect.objectContaining({
        id: 'tx-create',
        parentId: 'tx-edit-final',
      }),
    })
    expect(transformed[1]).toMatchObject({
      type: 'editDocumentVersion',
      id: 'tx-edit-prev',
      revisionId: 'tx-edit-final',
      parentId: 'tx-edit-final',
    })
  })

  it('squashes consecutive same-author updateLiveDocument events within 5 minutes', () => {
    const newer = assignEventId(
      {
        type: 'updateLiveDocument',
        documentId: 'doc-1',
        revisionId: 'r3',
        author: 'u1',
        timestamp: plusMin(3),
      },
      'published',
    )
    const olderSameAuthor = assignEventId(
      {
        type: 'updateLiveDocument',
        documentId: 'doc-1',
        revisionId: 'r2',
        author: 'u1',
        timestamp: plusMin(1),
      },
      'published',
    )
    const differentAuthor = assignEventId(
      {
        type: 'updateLiveDocument',
        documentId: 'doc-1',
        revisionId: 'r1',
        author: 'u2',
        timestamp: BASE_TS,
      },
      'published',
    )

    const transformed = applyVariantTransforms(
      [newer, olderSameAuthor, differentAuthor],
      'published',
    )
    expect(transformed.map((e) => e.id)).toEqual(['r3', 'r1'])
  })
})
