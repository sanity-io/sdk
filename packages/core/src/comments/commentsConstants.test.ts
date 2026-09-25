import {describe, expect, it} from 'vitest'

import {TARGET_REF} from './commentFixtures'
import {
  buildCommentsQueryFilter,
  buildDocumentCommentsQuery,
  buildListenQuery,
  buildSnapshotQuery,
} from './commentsConstants'

describe('buildDocumentCommentsQuery', () => {
  it('pins to one source document for an exact scope', () => {
    const {filter, params} = buildDocumentCommentsQuery(TARGET_REF, {
      type: 'exact',
      sourceDocumentId: 'versions.summer.doc-1',
    })

    expect(filter).toBe(
      '_type == "sanity.comment" && target.document._ref == $targetRef && target.sourceDocumentId == $sourceDocumentId',
    )
    expect(params).toEqual({targetRef: TARGET_REF, sourceDocumentId: 'versions.summer.doc-1'})
  })

  it('excludes releases when pooling draft and published', () => {
    const {filter, params} = buildDocumentCommentsQuery(TARGET_REF, {type: 'no-versions'})

    // A draft id and a published id both fail the prefix test, which is what
    // pools them; a version id is the only thing this leaves out.
    expect(filter).toBe(
      '_type == "sanity.comment" && target.document._ref == $targetRef && !string::startsWith(target.sourceDocumentId, "versions.")',
    )
    expect(params).toEqual({targetRef: TARGET_REF})
  })

  it('filters on the document alone when every variant is wanted', () => {
    const {filter, params} = buildDocumentCommentsQuery(TARGET_REF, {type: 'any'})

    expect(filter).toBe('_type == "sanity.comment" && target.document._ref == $targetRef')
    expect(params).toEqual({targetRef: TARGET_REF})
  })
})

describe('buildCommentsQueryFilter', () => {
  it('constrains a caller’s filter to comments', () => {
    // Parenthesised: an `||` in the caller's filter would otherwise escape the
    // type check and match whatever else the organization store holds.
    expect(buildCommentsQueryFilter('status == "open" || status == "resolved"')).toBe(
      '_type == "sanity.comment" && (status == "open" || status == "resolved")',
    )
  })
})

describe('query shapes', () => {
  it('orders the snapshot newest first and leaves the listener filter bare', () => {
    // A listener query has to be a plain filter, so the ordering the snapshot
    // uses cannot be applied there.
    expect(buildSnapshotQuery('x == 1')).toBe('*[x == 1] | order(_createdAt desc)')
    expect(buildListenQuery('x == 1')).toBe('*[x == 1]')
  })
})
