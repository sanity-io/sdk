import {describe, expect, it} from 'vitest'

import {type RawDocumentHistoryEvent} from './historyClient'
import {
  applyVariantTransforms,
  dedupeHistoryEvents,
  mergeVariantTimelines,
  normalizeHistoryEvent,
  sortHistoryEvents,
} from './normalizeHistoryEvents'
import {
  type DocumentHistoryCreatedEvent,
  type DocumentHistoryEditedEvent,
  type DocumentHistoryEvent,
  type DocumentHistoryPublishedEvent,
} from './types'

describe('normalizeHistoryEvent', () => {
  it('assigns variant-namespaced IDs, variantId, and normalized published documentId', () => {
    const rawUnpublish: RawDocumentHistoryEvent = {
      type: 'unpublishDocument',
      documentId: 'doc-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: '',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
    }

    const normalized = normalizeHistoryEvent(rawUnpublish, 'drafts.doc-1')
    expect(normalized).toMatchObject({
      id: 'drafts.doc-1:unpublishAt-2025-05-06T10:00:00Z',
      type: 'unpublished',
      documentId: 'doc-1',
      variantId: 'drafts.doc-1',
      documentVariantType: 'draft',
    })
  })

  it('produces distinct IDs for different documents sharing a revisionId in a multi-doc transaction', () => {
    const publishDocA: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-a',
      revisionId: 'shared-tx-1',
      versionId: 'versions.r1.doc-a',
      versionRevisionId: 'shared-tx-1',
      publishCause: 'release.publish',
      releaseId: 'r1',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00Z',
    }
    const publishDocB: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-b',
      revisionId: 'shared-tx-1',
      versionId: 'versions.r1.doc-b',
      versionRevisionId: 'shared-tx-1',
      publishCause: 'release.publish',
      releaseId: 'r1',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00Z',
    }

    const eventA = normalizeHistoryEvent(publishDocA, 'doc-a')
    const eventB = normalizeHistoryEvent(publishDocB, 'doc-b')
    expect(eventA.id).toBe('doc-a:shared-tx-1')
    expect(eventB.id).toBe('doc-b:shared-tx-1')
    expect(dedupeHistoryEvents([eventA], [eventB])).toHaveLength(2)
  })

  it('produces distinct IDs for published and draft variants of the same document', () => {
    const rawPublish: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-1',
      revisionId: 'rev-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'rev-1',
      publishCause: 'document.publish',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00Z',
    }

    const pubEvent = normalizeHistoryEvent(rawPublish, 'doc-1')
    const draftEvent = normalizeHistoryEvent(rawPublish, 'drafts.doc-1')
    expect(pubEvent.id).toBe('doc-1:rev-1')
    expect(draftEvent.id).toBe('drafts.doc-1:rev-1')
    expect(pubEvent.variantId).toBe('doc-1')
    expect(draftEvent.variantId).toBe('drafts.doc-1')
  })

  it('normalizes updateLiveDocument into an edited event with a single edit transaction', () => {
    const rawLiveEdit: RawDocumentHistoryEvent = {
      type: 'updateLiveDocument',
      documentId: 'doc-1',
      revisionId: 'rev-10',
      author: 'user-1',
      timestamp: '2025-05-06T10:05:00Z',
    }

    const normalized = normalizeHistoryEvent(rawLiveEdit, 'doc-1')
    expect(normalized).toEqual({
      id: 'doc-1:rev-10',
      type: 'edited',
      author: 'user-1',
      timestamp: '2025-05-06T10:05:00Z',
      documentId: 'doc-1',
      variantId: 'doc-1',
      documentVariantType: 'published',
      revisionId: 'rev-10',
      contributors: ['user-1'],
      transactions: [
        {
          type: 'editTransaction',
          author: 'user-1',
          timestamp: '2025-05-06T10:05:00Z',
          revisionId: 'rev-10',
        },
      ],
    })
  })
})

describe('dedupeHistoryEvents', () => {
  it('prefers semantic events over edited events sharing an ID and keeps distinct lifecycle types', () => {
    const edited: DocumentHistoryEditedEvent = {
      id: 'doc-1:rev-1',
      type: 'edited',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
      documentId: 'doc-1',
      variantId: 'doc-1',
      documentVariantType: 'published',
      revisionId: 'rev-1',
      contributors: ['user-1'],
      transactions: [
        {
          type: 'editTransaction',
          author: 'user-1',
          timestamp: '2025-05-06T10:00:00Z',
          revisionId: 'rev-1',
        },
      ],
    }
    const published: DocumentHistoryPublishedEvent = {
      id: 'doc-1:rev-1',
      type: 'published',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
      documentId: 'doc-1',
      variantId: 'doc-1',
      documentVariantType: 'published',
      revisionId: 'rev-1',
      versionId: 'drafts.doc-1',
      publishCause: 'document.publish',
    }
    const created: DocumentHistoryCreatedEvent = {
      id: 'doc-1:rev-1',
      type: 'created',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
      documentId: 'doc-1',
      variantId: 'doc-1',
      documentVariantType: 'published',
      revisionId: 'rev-1',
    }

    const deduped = dedupeHistoryEvents([edited], [published, created])
    expect(deduped.map((e) => `${e.type}:${e.id}`)).toEqual([
      'published:doc-1:rev-1',
      'created:created:doc-1:rev-1',
    ])
  })
})

describe('sortHistoryEvents', () => {
  it('orders newest first with deterministic event-rank and id tie-breaking', () => {
    const events: DocumentHistoryEvent[] = [
      {
        id: 'drafts.doc-1:c1',
        type: 'created',
        author: 'u1',
        timestamp: '2025-05-06T10:00:00.000Z',
        documentId: 'doc-1',
        variantId: 'drafts.doc-1',
        documentVariantType: 'draft',
      },
      {
        id: 'drafts.doc-1:p1',
        type: 'published',
        author: 'u1',
        timestamp: '2025-05-06T10:00:00.000Z',
        documentId: 'doc-1',
        variantId: 'drafts.doc-1',
        documentVariantType: 'draft',
        revisionId: 'p1',
        versionId: 'drafts.doc-1',
        publishCause: 'document.publish',
      },
      {
        id: 'drafts.doc-1:d1',
        type: 'deleted',
        author: 'u1',
        timestamp: '2025-05-06T10:00:00.000Z',
        documentId: 'doc-1',
        variantId: 'drafts.doc-1',
        documentVariantType: 'draft',
      },
    ]

    expect(sortHistoryEvents(events).map((e) => e.type)).toEqual([
      'deleted',
      'published',
      'created',
    ])
  })
})

describe('applyVariantTransforms & mergeVariantTimelines', () => {
  it('folds completed draft lifecycles per variant without crossing document boundaries', () => {
    const docAPublish: DocumentHistoryPublishedEvent = {
      id: 'drafts.doc-a:p1',
      type: 'published',
      author: 'user-1',
      timestamp: '2025-05-06T12:10:00Z',
      documentId: 'doc-a',
      variantId: 'drafts.doc-a',
      documentVariantType: 'draft',
      revisionId: 'pub-a',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'vrev-a2',
      publishCause: 'document.publish',
    }
    const docBCreate: DocumentHistoryCreatedEvent = {
      id: 'drafts.doc-b:c1',
      type: 'created',
      author: 'user-2',
      timestamp: '2025-05-06T12:05:00Z',
      documentId: 'doc-b',
      variantId: 'drafts.doc-b',
      documentVariantType: 'draft',
      versionId: 'drafts.doc-b',
      versionRevisionId: 'vrev-b1',
    }
    const docACreate: DocumentHistoryCreatedEvent = {
      id: 'drafts.doc-a:c1',
      type: 'created',
      author: 'user-1',
      timestamp: '2025-05-06T12:00:00Z',
      documentId: 'doc-a',
      variantId: 'drafts.doc-a',
      documentVariantType: 'draft',
      versionId: 'drafts.doc-a',
      versionRevisionId: 'vrev-a1',
    }

    const timelineA = applyVariantTransforms(sortHistoryEvents([docAPublish, docACreate]), 'draft')
    const timelineB = applyVariantTransforms(sortHistoryEvents([docBCreate]), 'draft')
    const merged = mergeVariantTimelines([timelineA, timelineB])

    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({
      type: 'published',
      documentId: 'doc-a',
      creationEvent: {id: 'drafts.doc-a:c1'},
    })
    expect(merged[1]).toMatchObject({
      type: 'created',
      documentId: 'doc-b',
      id: 'drafts.doc-b:c1',
    })
  })

  it('squashes consecutive same-author published edited events within 5 minutes and keeps different authors separate', () => {
    const makeLiveEdit = (
      id: string,
      author: string,
      timestamp: string,
    ): DocumentHistoryEditedEvent => ({
      id: `doc-1:${id}`,
      type: 'edited',
      author,
      timestamp,
      documentId: 'doc-1',
      variantId: 'doc-1',
      documentVariantType: 'published',
      revisionId: id,
      contributors: [author],
      transactions: [{type: 'editTransaction', author, timestamp, revisionId: id}],
    })

    const events = [
      makeLiveEdit('r3', 'user-1', '2025-05-06T12:04:00Z'),
      makeLiveEdit('r2', 'user-1', '2025-05-06T12:01:00Z'),
      makeLiveEdit('r1', 'user-2', '2025-05-06T12:00:00Z'),
    ]

    const transformed = applyVariantTransforms(events, 'published')
    expect(transformed).toHaveLength(2)
    expect(transformed[0]).toMatchObject({
      id: 'doc-1:r3',
      author: 'user-1',
      transactions: [
        {revisionId: 'r3', author: 'user-1'},
        {revisionId: 'r2', author: 'user-1'},
      ],
    })
    expect(transformed[1]).toMatchObject({id: 'doc-1:r1', author: 'user-2'})
  })
})
