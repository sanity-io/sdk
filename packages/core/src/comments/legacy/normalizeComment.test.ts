import {describe, expect, it} from 'vitest'

import {normalizeComment} from './normalizeComment'
import {type StoredComment} from './types'

function stored(overrides: Partial<StoredComment> = {}): StoredComment {
  return {
    _type: 'comment',
    _id: 'comment-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _rev: 'rev-1',
    authorId: 'user-1',
    message: null,
    threadId: 'thread-1',
    status: 'open',
    reactions: null,
    target: {
      documentType: 'author',
      document: {
        _dataset: 'production',
        _projectId: 'p',
        _ref: 'doc-1',
        _type: 'crossDatasetReference',
        _weak: true,
      },
    },
    ...overrides,
  }
}

describe('normalizeComment', () => {
  it('maps a stored comment to the public shape', () => {
    // Asserted in full. This mapping is the seam that lets storage change
    // without the public shape moving, so every field is deliberate.
    expect(normalizeComment(stored())).toEqual({
      id: 'comment-1',
      createdAt: '2026-01-01T00:00:00Z',
      authorId: 'user-1',
      message: null,
      threadId: 'thread-1',
      status: 'open',
      documentId: 'doc-1',
      documentType: 'author',
      fieldPath: '',
      reactions: [],
    })
  })

  it('leaves out what the stored comment does not have', () => {
    const normalized = normalizeComment(stored())

    // Absent rather than present-and-undefined, so a deep equality check in a
    // consumer's test does not have to know about keys it never set.
    expect('parentCommentId' in normalized).toBe(false)
    expect('lastEditedAt' in normalized).toBe(false)
    expect('selection' in normalized).toBe(false)
    expect('contentSnapshot' in normalized).toBe(false)
    expect('state' in normalized).toBe(false)
  })

  it('lifts the field path out of the target', () => {
    const comment = stored({
      target: {
        documentType: 'author',
        path: {field: 'body[_key=="intro"].content'},
        document: {_ref: 'doc-1', _type: 'reference', _weak: true},
      },
    })

    expect(normalizeComment(comment).fieldPath).toBe('body[_key=="intro"].content')
  })

  it('lifts a text selection out of the target', () => {
    const selection = {type: 'text' as const, value: [{_key: 'b1', text: 'marked'}]}
    const comment = stored({
      target: {
        documentType: 'author',
        path: {field: 'body', selection},
        document: {_ref: 'doc-1', _type: 'reference', _weak: true},
      },
    })

    expect(normalizeComment(comment).selection).toEqual(selection)
  })

  it('drops the array key from reactions', () => {
    const comment = stored({
      reactions: [{_key: 'user-2-:+1:', shortName: ':+1:', userId: 'user-2', addedAt: 'then'}],
    })

    expect(normalizeComment(comment).reactions).toEqual([
      {shortName: ':+1:', userId: 'user-2', addedAt: 'then'},
    ])
  })

  it('leaves the author out when the document does not carry one', () => {
    // The organization store records identity server-side rather than on the
    // document, and types it as doubly optional, so there are comments with no
    // author to map. Emitting `''` would look like a user id.
    const comment = stored()
    delete (comment as {authorId?: string}).authorId

    expect('authorId' in normalizeComment(comment)).toBe(false)
  })

  it('carries the local create state through', () => {
    const error = new Error('nope')
    const comment = stored({_state: {type: 'createError', error}})

    expect(normalizeComment(comment).state).toEqual({type: 'createError', error})
  })

  it('keeps replies pointed at their parent', () => {
    expect(normalizeComment(stored({parentCommentId: 'parent-1'})).parentCommentId).toBe('parent-1')
  })
})
