import {describe, expect, it} from 'vitest'

import {getEditingDocumentId, getEffectiveDocumentId} from './util'

const PUBLISHED = 'movie-1'
const DRAFT = 'drafts.movie-1'
const VERSION = 'versions.autumn.movie-1'

describe('getEditingDocumentId', () => {
  it('resolves the draft by default, which is what the Studio edits', () => {
    expect(getEditingDocumentId({documentId: PUBLISHED})).toBe(DRAFT)
  })

  it("resolves the draft under the 'drafts' perspective", () => {
    expect(getEditingDocumentId({documentId: PUBLISHED, perspective: 'drafts'})).toBe(DRAFT)
  })

  it("resolves the published document under the 'published' perspective", () => {
    expect(getEditingDocumentId({documentId: PUBLISHED, perspective: 'published'})).toBe(PUBLISHED)
  })

  it('resolves the version under a release perspective', () => {
    expect(
      getEditingDocumentId({documentId: PUBLISHED, perspective: {releaseName: 'autumn'}}),
    ).toBe(VERSION)
  })

  it('resolves the published document for live edit, which has no draft', () => {
    expect(getEditingDocumentId({documentId: PUBLISHED, liveEdit: true})).toBe(PUBLISHED)
  })

  it('is idempotent when handed an already-specific id', () => {
    expect(getEditingDocumentId({documentId: DRAFT})).toBe(DRAFT)
    expect(getEditingDocumentId({documentId: VERSION, perspective: 'published'})).toBe(PUBLISHED)
    expect(getEditingDocumentId({documentId: DRAFT, perspective: {releaseName: 'autumn'}})).toBe(
      VERSION,
    )
  })

  it('differs from getEffectiveDocumentId precisely where it has to', () => {
    // The canonical key collapses a draft onto its published id, which is right for
    // storing state and wrong for anything comparing exact ids.
    expect(getEffectiveDocumentId({documentId: DRAFT, documentType: 'movie'})).toBe(PUBLISHED)
    expect(getEditingDocumentId({documentId: DRAFT})).toBe(DRAFT)
  })
})
