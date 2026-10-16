import {describe, expect, it} from 'vitest'

import {storedComment, TARGET_REF} from './__fixtures__/comments'
import {buildCommentsQueryFilter, buildDocumentCommentsQuery} from './commentsConstants'
import {compileCommentsFilter} from './commentsFilterMatcher'
import {type StoredComment} from './types'

function matches(
  filter: string,
  comment: StoredComment,
  params: Record<string, unknown> = {},
  identity?: string,
): boolean | undefined {
  const matcher = compileCommentsFilter(filter)
  return matcher?.(comment, params, identity)
}

describe('compileCommentsFilter', () => {
  it('matches a comment on the document a scoped read covers', () => {
    const {filter, params} = buildDocumentCommentsQuery(TARGET_REF, {type: 'any'})

    expect(matches(filter, storedComment({_id: 'a'}), params)).toBe(true)
  })

  it('rejects a comment on another document', () => {
    const {filter, params} = buildDocumentCommentsQuery('dataset:p.d:other', {type: 'any'})

    expect(matches(filter, storedComment({_id: 'a'}), params)).toBe(false)
  })

  it('tells an exact scope apart from the pooled one', () => {
    const draft = storedComment({
      _id: 'a',
      target: {...storedComment({_id: 'a'}).target, sourceDocumentId: 'drafts.doc-1'},
    })

    const exact = buildDocumentCommentsQuery(TARGET_REF, {
      type: 'exact',
      sourceDocumentId: 'doc-1',
    })
    expect(matches(exact.filter, draft, exact.params)).toBe(false)

    const pooled = buildDocumentCommentsQuery(TARGET_REF, {type: 'draft-and-published'})
    expect(matches(pooled.filter, draft, pooled.params)).toBe(true)
  })

  it('leaves a version document out of the pooled scope', () => {
    const version = storedComment({
      _id: 'a',
      target: {...storedComment({_id: 'a'}).target, sourceDocumentId: 'versions.r1.doc-1'},
    })
    const {filter, params} = buildDocumentCommentsQuery(TARGET_REF, {type: 'draft-and-published'})

    expect(matches(filter, version, params)).toBe(false)
  })

  it('matches a set of documents given as a parameter', () => {
    const filter = buildCommentsQueryFilter('target.document._ref in $refs')

    expect(matches(filter, storedComment({_id: 'a'}), {refs: ['other', TARGET_REF]})).toBe(true)
    expect(matches(filter, storedComment({_id: 'a'}), {refs: ['other']})).toBe(false)
  })

  it('matches the mention query from the useCommentsQuery docs', () => {
    const filter = buildCommentsQueryFilter(
      'count(message[].children[_type == "mention" && userId == $userId]) > 0',
    )
    const mention = storedComment({
      _id: 'a',
      message: [
        {
          _type: 'block',
          children: [
            {_type: 'span', text: 'hi '},
            {_type: 'mention', userId: 'u-9'},
          ],
        },
      ],
    })

    expect(matches(filter, mention, {userId: 'u-9'})).toBe(true)
    expect(matches(filter, mention, {userId: 'u-8'})).toBe(false)
  })

  it('resolves identity()', () => {
    const filter = buildCommentsQueryFilter('_system.createdBy == identity()')

    expect(matches(filter, storedComment({_id: 'a'}), {}, 'user-1')).toBe(true)
    expect(matches(filter, storedComment({_id: 'a'}), {}, 'user-2')).toBe(false)
    // No signed in user is not the same as a match on nobody.
    expect(matches(filter, storedComment({_id: 'a'}), {})).toBe(false)
  })

  it('refuses a filter that dereferences', () => {
    // Evaluated against the one comment, this would answer "no match" rather
    // than fail, which is worse than admitting it cannot be answered.
    expect(compileCommentsFilter(buildCommentsQueryFilter('target.document->._id == $id'))).toBe(
      undefined,
    )
  })

  it('refuses a filter with a subquery', () => {
    expect(
      compileCommentsFilter(buildCommentsQueryFilter('threadId in *[_type == "other"]._id')),
    ).toBe(undefined)
  })

  it('refuses a filter that does not parse', () => {
    expect(compileCommentsFilter('status ==')).toBe(undefined)
  })

  it('returns the same matcher for a filter it has already compiled', () => {
    const filter = buildCommentsQueryFilter('status == "open"')

    expect(compileCommentsFilter(filter)).toBe(compileCommentsFilter(filter))
  })
})
