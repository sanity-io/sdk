import {describe, expect, it} from 'vitest'

import {getDocumentVariantId} from './getDocumentVariantId'
import {getEffectiveDocumentId} from './util'

const PUBLISHED = 'movie-1'
const DRAFT = 'drafts.movie-1'
const VERSION = 'versions.autumn.movie-1'

describe('getDocumentVariantId', () => {
  const datasetResource = {projectId: 'proj-1', dataset: 'production'} as const
  const canvasResource = {canvasId: 'canvas-1'} as const
  const mediaLibraryResource = {mediaLibraryId: 'ml-1'} as const

  it('resolves the draft by default', () => {
    expect(getDocumentVariantId({documentId: PUBLISHED})).toBe(DRAFT)
  })

  it("resolves the draft under the 'drafts' perspective", () => {
    expect(getDocumentVariantId({documentId: PUBLISHED, perspective: 'drafts'})).toBe(DRAFT)
  })

  it("resolves the published document under the 'published' perspective", () => {
    expect(getDocumentVariantId({documentId: PUBLISHED, perspective: 'published'})).toBe(PUBLISHED)
  })

  it('resolves the version under a release perspective', () => {
    expect(
      getDocumentVariantId({documentId: PUBLISHED, perspective: {releaseName: 'autumn'}}),
    ).toBe(VERSION)
  })

  it('resolves the published document for live edit, which has no draft', () => {
    expect(getDocumentVariantId({documentId: PUBLISHED, liveEdit: true})).toBe(PUBLISHED)
    expect(getDocumentVariantId({documentId: DRAFT, liveEdit: true}, datasetResource)).toBe(
      PUBLISHED,
    )
  })

  it('is idempotent when handed an already-specific id', () => {
    expect(getDocumentVariantId({documentId: DRAFT})).toBe(DRAFT)
    expect(getDocumentVariantId({documentId: VERSION, perspective: 'published'})).toBe(PUBLISHED)
    expect(getDocumentVariantId({documentId: DRAFT, perspective: {releaseName: 'autumn'}})).toBe(
      VERSION,
    )
  })

  it('forces published IDs and ignores release perspectives for Canvas resources', () => {
    expect(
      getDocumentVariantId(
        {
          documentId: DRAFT,
          documentType: 'canvasDoc',
          perspective: {releaseName: 'autumn'},
        },
        canvasResource,
      ),
    ).toBe(PUBLISHED)
  })

  it('respects drafted vs liveEdit document types on Media Library resources', () => {
    expect(
      getDocumentVariantId(
        {documentId: 'asset-1', documentType: 'sanity.asset'},
        mediaLibraryResource,
      ),
    ).toBe('drafts.asset-1')

    expect(
      getDocumentVariantId(
        {
          documentId: 'asset-1',
          documentType: 'sanity.asset',
          perspective: {releaseName: 'autumn'},
        },
        mediaLibraryResource,
      ),
    ).toBe('drafts.asset-1')

    expect(
      getDocumentVariantId(
        {documentId: 'drafts.aspect-1', documentType: 'customAspect'},
        mediaLibraryResource,
      ),
    ).toBe('aspect-1')
  })

  it('differs from getEffectiveDocumentId precisely where it has to', () => {
    // The canonical key collapses a draft onto its published id, which is right for
    // storing state and wrong for anything comparing exact ids.
    expect(getEffectiveDocumentId({documentId: DRAFT, documentType: 'movie'})).toBe(PUBLISHED)
    expect(getDocumentVariantId({documentId: DRAFT})).toBe(DRAFT)
  })
})
