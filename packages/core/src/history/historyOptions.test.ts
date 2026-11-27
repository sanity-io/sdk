import {afterEach, describe, expect, it} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {
  DEFAULT_HISTORY_LIMIT,
  getDocumentsHistoryOptionsKey,
  getDocumentVariantType,
  MAX_HISTORY_DOCUMENTS,
  parseDocumentsHistoryOptionsKey,
  resolveDocumentsHistoryRequest,
  resolveHistoryDocumentId,
} from './historyOptions'

describe('resolveHistoryDocumentId', () => {
  const datasetResource = {projectId: 'proj-1', dataset: 'production'} as const
  const canvasResource = {canvasId: 'canvas-1'} as const
  const mediaLibraryResource = {mediaLibraryId: 'ml-1'} as const

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

describe('resolveDocumentsHistoryRequest', () => {
  let instance: SanityInstance | undefined

  afterEach(() => {
    instance?.dispose()
    instance = undefined
  })

  it('returns null when documents array is empty', () => {
    instance = createSanityInstance({projectId: 'proj-1', dataset: 'production'})
    expect(resolveDocumentsHistoryRequest(instance, {documents: []})).toBeNull()
  })

  it('deduplicates and sorts resolved variant IDs across perspectives', () => {
    instance = createSanityInstance({projectId: 'proj-1', dataset: 'production'})
    const resolved = resolveDocumentsHistoryRequest(instance, {
      documents: [
        {documentId: 'doc-b', documentType: 'article'},
        {documentId: 'doc-a', documentType: 'article', perspective: 'published'},
        {documentId: 'doc-b', documentType: 'article', perspective: 'drafts'},
        {documentId: 'doc-a', documentType: 'article', perspective: {releaseName: 'r1'}},
      ],
      limit: 50,
    })

    expect(resolved).toEqual({
      resource: {projectId: 'proj-1', dataset: 'production'},
      variantIds: ['doc-a', 'drafts.doc-b', 'versions.r1.doc-a'],
      limit: 50,
    })
  })

  it('falls back to instance config perspective and default limit', () => {
    instance = createSanityInstance({
      projectId: 'proj-1',
      dataset: 'production',
      perspective: 'published',
    })
    const resolved = resolveDocumentsHistoryRequest(instance, {
      documents: [{documentId: 'doc-1', documentType: 'article'}],
    })

    expect(resolved).toEqual({
      resource: {projectId: 'proj-1', dataset: 'production'},
      variantIds: ['doc-1'],
      limit: DEFAULT_HISTORY_LIMIT,
    })
  })

  it('throws when handles belong to different resources', () => {
    instance = createSanityInstance({projectId: 'proj-1', dataset: 'production'})
    expect(() =>
      resolveDocumentsHistoryRequest(instance!, {
        documents: [
          {documentId: 'doc-1', documentType: 'article'},
          {documentId: 'doc-2', documentType: 'article', projectId: 'proj-1', dataset: 'staging'},
        ],
      }),
    ).toThrow(/Mismatched resources found in documents/)
  })

  it('throws when no resource is configured on handles or instance', () => {
    instance = createSanityInstance({})
    expect(() =>
      resolveDocumentsHistoryRequest(instance!, {
        documents: [{documentId: 'doc-1', documentType: 'article'}],
      }),
    ).toThrow(/requires a project ID and dataset/)
  })

  it('throws when distinct resolved variants exceed MAX_HISTORY_DOCUMENTS', () => {
    instance = createSanityInstance({projectId: 'proj-1', dataset: 'production'})
    const documents = Array.from({length: MAX_HISTORY_DOCUMENTS + 1}, (_, i) => ({
      documentId: `doc-${i}`,
      documentType: 'article',
    }))

    expect(() => resolveDocumentsHistoryRequest(instance!, {documents})).toThrow(
      new RegExp(`more than ${MAX_HISTORY_DOCUMENTS}`),
    )
  })
})

describe('getDocumentsHistoryOptionsKey & parseDocumentsHistoryOptionsKey', () => {
  it('round-trips options and produces order-independent canonical keys', () => {
    const docA = {
      documentId: 'doc-a',
      documentType: 'article',
      projectId: 'proj-1',
      dataset: 'production',
      perspective: 'published' as const,
    }
    const docB = {
      documentId: 'doc-b',
      documentType: 'article',
      projectId: 'proj-1',
      dataset: 'production',
      perspective: {releaseName: 'r1'},
    }

    const key1 = getDocumentsHistoryOptionsKey({documents: [docA, docB, docA], limit: 25})
    const key2 = getDocumentsHistoryOptionsKey({documents: [docB, docA], limit: 25})

    expect(key1).toBe(key2)
    expect(parseDocumentsHistoryOptionsKey(key1)).toEqual({
      documents: [docA, docB],
      limit: 25,
    })
  })
})
