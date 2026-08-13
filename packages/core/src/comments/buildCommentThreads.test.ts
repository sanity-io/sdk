import {describe, expect, it} from 'vitest'

import {buildCommentThreads} from './buildCommentThreads'
import {type Comment} from './types'

function comment(overrides: Partial<Comment> & Pick<Comment, 'id'>): Comment {
  return {
    createdAt: '2026-01-01T00:00:00Z',
    authorId: 'user-1',
    message: null,
    threadId: 'thread-1',
    status: 'open',
    reactions: [],
    documentId: 'doc-1',
    documentType: 'author',
    fieldPath: '',
    ...overrides,
  }
}

describe('buildCommentThreads', () => {
  it('returns nothing for an empty list', () => {
    expect(buildCommentThreads([])).toEqual([])
  })

  it('groups a parent with its replies, oldest reply first', () => {
    const parent = comment({id: 'a', createdAt: '2026-01-01T00:00:00Z'})
    const second = comment({id: 'c', createdAt: '2026-01-03T00:00:00Z', parentCommentId: 'a'})
    const first = comment({id: 'b', createdAt: '2026-01-02T00:00:00Z', parentCommentId: 'a'})

    expect(buildCommentThreads([second, first, parent])).toEqual([
      {
        threadId: 'thread-1',
        fieldPath: '',
        parentComment: parent,
        replies: [first, second],
        commentsCount: 3,
        status: 'open',
        lastActivityAt: '2026-01-03T00:00:00Z',
      },
    ])
  })

  it('takes fieldPath from the parent', () => {
    const parent = comment({id: 'a', fieldPath: 'body[_key=="intro"].content'})

    expect(buildCommentThreads([parent])[0].fieldPath).toBe('body[_key=="intro"].content')
  })

  it('falls back to the parent createdAt when there are no replies', () => {
    const parent = comment({id: 'a', createdAt: '2026-02-02T00:00:00Z'})

    expect(buildCommentThreads([parent])[0]).toMatchObject({
      commentsCount: 1,
      lastActivityAt: '2026-02-02T00:00:00Z',
      replies: [],
    })
  })

  it('drops replies whose parent is missing', () => {
    // Happens between a parent being deleted and its replies disappearing.
    const orphan = comment({id: 'b', parentCommentId: 'gone'})

    expect(buildCommentThreads([orphan])).toEqual([])
  })

  it('keeps threads in the order their parents arrive', () => {
    const newer = comment({id: 'a', threadId: 'thread-a', createdAt: '2026-01-05T00:00:00Z'})
    const older = comment({id: 'b', threadId: 'thread-b', createdAt: '2026-01-01T00:00:00Z'})

    expect(buildCommentThreads([newer, older]).map((thread) => thread.threadId)).toEqual([
      'thread-a',
      'thread-b',
    ])
  })

  it('reports the parent status for the thread', () => {
    const parent = comment({id: 'a', status: 'resolved'})
    const reply = comment({id: 'b', parentCommentId: 'a', status: 'resolved'})

    expect(buildCommentThreads([parent, reply])[0].status).toBe('resolved')
  })
})
