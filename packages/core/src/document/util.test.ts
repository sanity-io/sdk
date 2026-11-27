import {describe, expect, it} from 'vitest'

import {getEffectiveDocumentId} from './util'

const PUBLISHED = 'movie-1'
const DRAFT = 'drafts.movie-1'
const VERSION = 'versions.autumn.movie-1'

describe('getEffectiveDocumentId', () => {
  it('collapses a draft onto its published id', () => {
    expect(getEffectiveDocumentId({documentId: DRAFT, documentType: 'movie'})).toBe(PUBLISHED)
    expect(getEffectiveDocumentId({documentId: PUBLISHED, documentType: 'movie'})).toBe(PUBLISHED)
  })

  it('returns the version id under a release perspective', () => {
    expect(
      getEffectiveDocumentId({
        documentId: PUBLISHED,
        documentType: 'movie',
        perspective: {releaseName: 'autumn'},
      }),
    ).toBe(VERSION)
  })

  it('preserves the document id as-is for liveEdit handles', () => {
    expect(
      getEffectiveDocumentId({documentId: PUBLISHED, documentType: 'movie', liveEdit: true}),
    ).toBe(PUBLISHED)
  })
})
