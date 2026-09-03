import {describe, expect, it} from 'vitest'

import {commentTarget, storedComment, TARGET_REF} from './commentFixtures'
import {normalizeComment} from './normalizeComment'

const MESSAGE = [{_type: 'block', children: [{_type: 'span', text: 'hello'}]}]

describe('normalizeComment', () => {
  it('maps a stored comment to the public shape', () => {
    // Asserted in full. This mapping is the seam that lets storage change
    // without the public shape moving, so every field is deliberate.
    expect(normalizeComment(storedComment({_id: 'comment-1'}))).toEqual({
      id: 'comment-1',
      createdAt: '2026-01-01T00:00:00Z',
      authorId: 'user-1',
      message: MESSAGE,
      threadId: 'thread-1',
      status: 'open',
      documentId: 'doc-1',
      sourceDocumentId: 'doc-1',
      documentType: 'author',
      fieldPath: 'name',
      reactions: [],
    })
  })

  it('unwraps the published id from the global document reference', () => {
    // The reference is `resourceType:resourceId:documentId`, and the resource id
    // of a dataset carries a dot of its own, so this cannot split naively.
    const comment = storedComment({
      _id: 'comment-1',
      target: commentTarget({
        document: {
          _ref: 'dataset:project.production:foo.doc-1',
          _type: 'globalDocumentReference',
          _weak: true,
        },
      }),
    })

    expect(normalizeComment(comment).documentId).toBe('foo.doc-1')
  })

  it('keeps the source document id the comment was written against', () => {
    // `documentId` groups a document's variants into one thread list, so this is
    // the only thing that tells a release's comments from a draft's.
    const comment = storedComment({
      _id: 'comment-1',
      target: commentTarget({sourceDocumentId: 'versions.summer.doc-1'}),
    })

    const normalized = normalizeComment(comment)
    expect(normalized.documentId).toBe('doc-1')
    expect(normalized.sourceDocumentId).toBe('versions.summer.doc-1')
  })

  it('leaves out what the stored comment does not have', () => {
    const normalized = normalizeComment(storedComment({_id: 'comment-1'}))

    // Absent rather than present-and-undefined, so a deep equality check in a
    // consumer's test does not have to know about keys it never set.
    expect('parentCommentId' in normalized).toBe(false)
    expect('lastEditedAt' in normalized).toBe(false)
    expect('selection' in normalized).toBe(false)
    expect('contentSnapshot' in normalized).toBe(false)
    expect('state' in normalized).toBe(false)
  })

  it('lifts the field path out of the target', () => {
    const comment = storedComment({
      _id: 'comment-1',
      target: commentTarget({path: {field: 'body[_key=="intro"].content'}}),
    })

    expect(normalizeComment(comment).fieldPath).toBe('body[_key=="intro"].content')
  })

  it('lifts a text selection out of the target', () => {
    const selection = {type: 'text' as const, value: [{_key: 'b1', text: 'marked'}]}
    const comment = storedComment({
      _id: 'comment-1',
      target: commentTarget({path: {field: 'body', selection}}),
    })

    expect(normalizeComment(comment).selection).toEqual(selection)
  })

  it('drops the array key from reactions', () => {
    const comment = storedComment({
      _id: 'comment-1',
      reactions: [{_key: 'r1', shortName: ':+1:', userId: 'user-2', addedAt: 'then'}],
    })

    expect(normalizeComment(comment).reactions).toEqual([
      {shortName: ':+1:', userId: 'user-2', addedAt: 'then'},
    ])
  })

  it('leaves the author out when the comment does not carry one', () => {
    // The organization store records identity server-side and types it as
    // doubly optional, so there are comments with no author to map — an
    // agent-written one, for instance. Emitting `''` would look like a user id.
    const comment = storedComment({_id: 'comment-1', _system: {}})

    expect('authorId' in normalizeComment(comment)).toBe(false)
  })

  it('falls back to an id when the comment carries no thread id', () => {
    // The thread id is the API's to assign, and the type makes it optional, so
    // the public shape cannot promise one without a fallback: a thread takes it
    // from its first comment, a reply from the comment it answers.
    const parent = storedComment({_id: 'comment-1', threadId: undefined})
    const reply = storedComment({
      _id: 'comment-2',
      threadId: undefined,
      parentCommentId: 'comment-1',
    })

    expect(normalizeComment(parent).threadId).toBe('comment-1')
    expect(normalizeComment(reply).threadId).toBe('comment-1')
  })

  it('carries the local create state through', () => {
    const error = new Error('nope')
    const comment = storedComment({_id: 'comment-1', _state: {type: 'createError', error}})

    expect(normalizeComment(comment).state).toEqual({type: 'createError', error})
  })

  it('keeps replies pointed at their parent', () => {
    const reply = storedComment({_id: 'comment-2', parentCommentId: 'parent-1'})
    expect(normalizeComment(reply).parentCommentId).toBe('parent-1')
  })

  it('carries the content snapshot through untouched', () => {
    const contentSnapshot = [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'x'}]}]
    const comment = storedComment({_id: 'comment-1', contentSnapshot})

    expect(normalizeComment(comment).contentSnapshot).toEqual(contentSnapshot)
  })
})

describe('target reference edge cases', () => {
  it('returns the reference as-is when it is not a global document reference', () => {
    // Not something the API produces, but the parse must not hand back an empty
    // document id if it ever does.
    const comment = storedComment({_id: 'comment-1'})
    comment.target.document._ref = 'doc-1' as typeof TARGET_REF

    expect(normalizeComment(comment).documentId).toBe('doc-1')
  })
})
