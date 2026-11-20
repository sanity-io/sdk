import {describe, expect, it} from 'vitest'

import {
  getDocumentHistoryOptionsKey,
  getDocumentVariantType,
  parseDocumentHistoryOptionsKey,
  resolveHistoryDocumentId,
} from './historyOptions'
import {
  type DocumentHistoryEvent,
  isCreateDocumentVersionHistoryEvent,
  isCreateLiveDocumentHistoryEvent,
  isDeleteDocumentGroupHistoryEvent,
  isDeleteDocumentVersionHistoryEvent,
  isEditDocumentVersionHistoryEvent,
  isHistoryClearedEvent,
  isPublishDocumentVersionHistoryEvent,
  isUnpublishDocumentHistoryEvent,
  isUpdateLiveDocumentHistoryEvent,
} from './types'

describe('resolveHistoryDocumentId', () => {
  const datasetResource = {projectId: 'proj-1', dataset: 'production'} as const
  const canvasResource = {type: 'canvas', canvasId: 'canvas-1'} as const
  const mediaLibraryResource = {type: 'media-library', mediaLibraryId: 'ml-1'} as const

  it('preserves explicit version IDs regardless of perspective or resource', () => {
    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'versions.rSummer.article-1',
          documentType: 'article',
          perspective: 'published',
        },
        canvasResource,
      ),
    ).toBe('versions.rSummer.article-1')
  })

  it('returns the published ID when liveEdit is enabled on the handle', () => {
    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'drafts.article-1',
          documentType: 'article',
          liveEdit: true,
        },
        datasetResource,
      ),
    ).toBe('article-1')
  })

  it('returns the published ID for Canvas resources even without liveEdit on the handle', () => {
    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'drafts.doc-1',
          documentType: 'canvasDoc',
          perspective: {releaseName: 'r1'},
        },
        canvasResource,
      ),
    ).toBe('doc-1')
  })

  it('respects drafted vs liveEdit types on Media Library resources', () => {
    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'asset-1',
          documentType: 'sanity.asset',
        },
        mediaLibraryResource,
      ),
    ).toBe('drafts.asset-1')

    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'asset-1',
          documentType: 'sanity.asset',
          perspective: {releaseName: 'r1'},
        },
        mediaLibraryResource,
      ),
    ).toBe('drafts.asset-1')

    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'drafts.aspect-1',
          documentType: 'customAspect',
        },
        mediaLibraryResource,
      ),
    ).toBe('aspect-1')
  })

  it('returns the version ID under a release perspective when releases are supported', () => {
    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'article-1',
          documentType: 'article',
          perspective: {releaseName: 'rLaunch'},
        },
        datasetResource,
      ),
    ).toBe('versions.rLaunch.article-1')
  })

  it('returns the published ID when perspective is published', () => {
    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'drafts.article-1',
          documentType: 'article',
          perspective: 'published',
        },
        datasetResource,
      ),
    ).toBe('article-1')
  })

  it('defaults to the draft ID for drafts or omitted perspective', () => {
    expect(
      resolveHistoryDocumentId({
        documentId: 'article-1',
        documentType: 'article',
      }),
    ).toBe('drafts.article-1')

    expect(
      resolveHistoryDocumentId(
        {
          documentId: 'article-1',
          documentType: 'article',
          perspective: 'drafts',
        },
        datasetResource,
      ),
    ).toBe('drafts.article-1')
  })
})

describe('getDocumentVariantType', () => {
  it('classifies published, draft, and version IDs', () => {
    expect(getDocumentVariantType('article-1')).toBe('published')
    expect(getDocumentVariantType('drafts.article-1')).toBe('draft')
    expect(getDocumentVariantType('versions.r1.article-1')).toBe('version')
  })
})

describe('getDocumentHistoryOptionsKey / parseDocumentHistoryOptionsKey', () => {
  it('round-trips options deterministically regardless of property insertion order', () => {
    const keyA = getDocumentHistoryOptionsKey({
      documentId: 'doc-1',
      documentType: 'post',
      projectId: 'p',
      dataset: 'd',
      limit: 50,
      includeEditEvents: false,
      liveEdit: false,
      perspective: 'published',
    })
    const keyB = getDocumentHistoryOptionsKey({
      perspective: 'published',
      liveEdit: false,
      includeEditEvents: false,
      limit: 50,
      dataset: 'd',
      projectId: 'p',
      documentType: 'post',
      documentId: 'doc-1',
    })

    expect(keyA).toBe(keyB)
    expect(parseDocumentHistoryOptionsKey(keyA)).toEqual({
      documentId: 'doc-1',
      documentType: 'post',
      projectId: 'p',
      dataset: 'd',
      limit: 50,
      includeEditEvents: false,
      liveEdit: false,
      perspective: 'published',
    })
  })
})

describe('DocumentHistoryEvent type guards', () => {
  const base = {
    id: 'ev-1',
    author: 'user-1',
    timestamp: '2025-05-01T12:00:00Z',
    documentId: 'doc-1',
    documentVariantType: 'published' as const,
  }

  it('narrows each event discriminant accurately', () => {
    const events: DocumentHistoryEvent[] = [
      {...base, type: 'createLiveDocument', revisionId: 'r1'},
      {...base, type: 'updateLiveDocument', revisionId: 'r2'},
      {...base, type: 'deleteDocumentGroup'},
      {...base, type: 'createDocumentVersion', versionId: 'drafts.doc-1', versionRevisionId: 'r3'},
      {...base, type: 'deleteDocumentVersion', versionId: 'drafts.doc-1', versionRevisionId: 'r4'},
      {
        ...base,
        type: 'publishDocumentVersion',
        revisionId: 'r5',
        versionId: 'drafts.doc-1',
        publishCause: 'document.publish',
      },
      {...base, type: 'unpublishDocument', versionId: 'drafts.doc-1', versionRevisionId: 'r6'},
      {
        ...base,
        type: 'editDocumentVersion',
        revisionId: 'r7',
        contributors: ['user-1'],
        transactions: [],
      },
      {...base, type: 'historyCleared'},
    ]

    expect(events.filter(isCreateLiveDocumentHistoryEvent)).toHaveLength(1)
    expect(events.filter(isUpdateLiveDocumentHistoryEvent)).toHaveLength(1)
    expect(events.filter(isDeleteDocumentGroupHistoryEvent)).toHaveLength(1)
    expect(events.filter(isCreateDocumentVersionHistoryEvent)).toHaveLength(1)
    expect(events.filter(isDeleteDocumentVersionHistoryEvent)).toHaveLength(1)
    expect(events.filter(isPublishDocumentVersionHistoryEvent)).toHaveLength(1)
    expect(events.filter(isUnpublishDocumentHistoryEvent)).toHaveLength(1)
    expect(events.filter(isEditDocumentVersionHistoryEvent)).toHaveLength(1)
    expect(events.filter(isHistoryClearedEvent)).toHaveLength(1)
  })
})
