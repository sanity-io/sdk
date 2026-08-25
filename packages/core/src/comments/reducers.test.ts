import {describe, expect, it} from 'vitest'

import {
  addComment,
  addSubscriber,
  applyCommentUpdate,
  clearPendingTransaction,
  type CommentsStoreState,
  getCommentsKey,
  parseCommentsKey,
  receiveComment,
  removeCommentById,
  removeSubscriber,
  rollbackCommentUpdate,
  setComments,
  setCommentsError,
  setPendingTransaction,
} from './reducers'
import {type StoredComment} from './types'

const KEY = getCommentsKey({documentId: 'doc-1'})

function comment(overrides: Partial<StoredComment> & Pick<StoredComment, '_id'>) {
  return {
    _type: 'comment',
    _createdAt: '2026-01-01T00:00:00Z',
    _rev: 'rev',
    authorId: 'user-1',
    message: null,
    threadId: 'thread-1',
    status: 'open',
    reactions: null,
    target: {documentType: 'author', document: {_ref: 'doc-1', _type: 'reference', _weak: true}},
    ...overrides,
  } satisfies StoredComment as StoredComment
}

function stateWith(comments: StoredComment[]): CommentsStoreState {
  const base: CommentsStoreState = {
    entries: {[KEY]: {subscribers: ['sub-1']}},
    pendingCreates: {},
    pendingTransactions: {},
  }
  return setComments(KEY, comments)(base)
}

const emptyState = (): CommentsStoreState => ({
  entries: {},
  pendingCreates: {},
  pendingTransactions: {},
})

describe('comment list keys', () => {
  it('round-trips a document id', () => {
    expect(parseCommentsKey(getCommentsKey({documentId: 'doc-1'}))).toEqual({documentId: 'doc-1'})
  })

  it('round-trips a release version', () => {
    const key = getCommentsKey({documentId: 'doc-1', documentVersionId: 'summer'})
    expect(parseCommentsKey(key)).toEqual({documentId: 'doc-1', documentVersionId: 'summer'})
  })

  it('separates a release from the default list', () => {
    expect(getCommentsKey({documentId: 'doc-1'})).not.toBe(
      getCommentsKey({documentId: 'doc-1', documentVersionId: 'summer'}),
    )
  })
})

describe('subscribers', () => {
  const empty = emptyState()

  it('creates an entry for the first subscriber', () => {
    expect(addSubscriber(KEY, 'sub-1')(empty).entries[KEY]).toEqual({subscribers: ['sub-1']})
  })

  it('drops the entry when the last subscriber leaves', () => {
    const one = addSubscriber(KEY, 'sub-1')(empty)
    expect(removeSubscriber(KEY, 'sub-1')(one).entries).toEqual({})
  })

  it('keeps the entry while another subscriber remains', () => {
    const two = addSubscriber(KEY, 'sub-2')(addSubscriber(KEY, 'sub-1')(empty))
    expect(removeSubscriber(KEY, 'sub-1')(two).entries[KEY]).toEqual({subscribers: ['sub-2']})
  })

  it('drops reconciliation state when the last listener leaves', () => {
    const before = {
      ...stateWith([comment({_id: 'a'})]),
      pendingCreates: {a: true as const},
      pendingTransactions: {a: 'tx-1'},
    }

    const next = removeSubscriber(KEY, 'sub-1')(before)

    expect(next.entries).toEqual({})
    expect(next.pendingCreates).toEqual({})
    expect(next.pendingTransactions).toEqual({})
  })

  it('ignores removal for an unknown key', () => {
    expect(removeSubscriber('missing', 'sub-1')(empty)).toBe(empty)
  })
})

describe('setComments', () => {
  it('keys the snapshot by comment id and clears any previous error', () => {
    const withError = setCommentsError(
      KEY,
      new Error('boom'),
    )({...emptyState(), entries: {[KEY]: {subscribers: ['sub-1']}}})

    const next = setComments(KEY, [comment({_id: 'a'})])(withError)

    expect(Object.keys(next.entries[KEY]!.comments!)).toEqual(['a'])
    expect(next.entries[KEY]!.error).toBe(undefined)
  })

  it('ignores a snapshot for an entry nobody is reading', () => {
    const empty = emptyState()
    expect(setComments(KEY, [comment({_id: 'a'})])(empty)).toBe(empty)
  })

  it('keeps a failed local create that is absent from the snapshot', () => {
    const failed = comment({
      _id: 'failed',
      message: [{_type: 'block', _key: 'block-1', children: [{_type: 'span', text: 'unsent'}]}],
      _state: {type: 'createError', error: new Error('nope')},
    })

    const next = setComments(KEY, [])(stateWith([failed]))

    expect(next.entries[KEY]!.comments!['failed']).toBe(failed)
  })

  it('keeps an in-flight local create that is absent from the snapshot', () => {
    const optimistic = addComment(KEY, {
      _id: 'pending',
      _type: 'comment',
      authorId: 'user-1',
      message: null,
      threadId: 'thread-2',
      status: 'open',
      reactions: null,
      target: {documentType: 'author', document: {_ref: 'doc-1', _type: 'reference', _weak: true}},
    })(stateWith([]))

    const next = setComments(KEY, [])(optimistic)

    expect(next.entries[KEY]!.comments!['pending']).toBeDefined()
  })

  it('stores comment ids such as __proto__ as ordinary keys', () => {
    const special = comment({_id: '__proto__'})
    const next = setComments(KEY, [special])(stateWith([]))

    expect(Object.values(next.entries[KEY]!.comments!)).toEqual([special])
  })
})

describe('addComment', () => {
  it('stands in a createdAt so an unconfirmed comment still sorts', () => {
    const next = addComment(KEY, {
      _id: 'new',
      _type: 'comment',
      authorId: 'user-1',
      message: null,
      threadId: 'thread-2',
      status: 'open',
      reactions: null,
      target: {documentType: 'author', document: {_ref: 'doc-1', _type: 'reference', _weak: true}},
    })(stateWith([]))

    expect(next.entries[KEY]!.comments!['new']._createdAt).toEqual(expect.any(String))
  })

  it('keeps the server createdAt once there is one', () => {
    const existing = comment({_id: 'a', _createdAt: '2026-03-03T00:00:00Z'})
    const next = addComment(KEY, {...existing})(stateWith([existing]))

    expect(next.entries[KEY]!.comments!['a']._createdAt).toBe('2026-03-03T00:00:00Z')
  })

  it('marks a failed comment as retrying when it is added again', () => {
    const failed = comment({
      _id: 'a',
      _state: {type: 'createError', error: new Error('nope')},
    })
    const payload = {...failed}
    delete payload._state

    const next = addComment(KEY, payload)(stateWith([failed]))

    expect(next.entries[KEY]!.comments!['a']._state).toEqual({type: 'createRetrying'})
  })
})

describe('applyCommentUpdate', () => {
  it('merges a patch into the comment', () => {
    const next = applyCommentUpdate('a', {status: 'resolved'})(stateWith([comment({_id: 'a'})]))
    expect(next.entries[KEY]!.comments!['a'].status).toBe('resolved')
  })

  it('leaves state untouched for an unknown comment', () => {
    const before = stateWith([comment({_id: 'a'})])
    expect(applyCommentUpdate('missing', {status: 'resolved'})(before)).toBe(before)
  })
})

describe('removeCommentById', () => {
  it('removes the comment and its replies', () => {
    const before = stateWith([
      comment({_id: 'a'}),
      comment({_id: 'b', parentCommentId: 'a'}),
      comment({_id: 'c'}),
    ])

    expect(Object.keys(removeCommentById('a')(before).entries[KEY]!.comments!)).toEqual(['c'])
  })

  it('removes a single reply without touching its siblings', () => {
    const before = stateWith([
      comment({_id: 'a'}),
      comment({_id: 'b', parentCommentId: 'a'}),
      comment({_id: 'c', parentCommentId: 'a'}),
    ])

    expect(Object.keys(removeCommentById('b')(before).entries[KEY]!.comments!)).toEqual(['a', 'c'])
  })

  it('leaves state untouched for an unknown comment', () => {
    const before = stateWith([comment({_id: 'a'})])
    expect(removeCommentById('missing')(before)).toBe(before)
  })
})

describe('receiveComment', () => {
  it('replaces what we held with the server copy', () => {
    const before = stateWith([comment({_id: 'a', status: 'open'})])
    const next = receiveComment(KEY, comment({_id: 'a', status: 'resolved'}))(before)

    expect(next.entries[KEY]!.comments!['a'].status).toBe('resolved')
  })

  it('clears create reconciliation after the entry has been released', () => {
    const before: CommentsStoreState = {...emptyState(), pendingCreates: {a: true}}

    expect(receiveComment(KEY, comment({_id: 'a'}))(before).pendingCreates).toEqual({})
  })
})

describe('pending transactions', () => {
  it('records and clears the transaction for a comment', () => {
    const set = setPendingTransaction('a', 'tx-1')(emptyState())
    expect(set.pendingTransactions).toEqual({a: 'tx-1'})
    expect(clearPendingTransaction('a')(set).pendingTransactions).toEqual({})
  })

  it('rolls back an optimistic edit while its transaction is still current', () => {
    const previous = comment({_id: 'a', status: 'open'})
    const pending = setPendingTransaction('a', 'tx-1')(stateWith([previous]))
    const optimistic = applyCommentUpdate('a', {status: 'resolved'})(pending)

    const rolledBack = rollbackCommentUpdate('a', 'tx-1', previous)(optimistic)

    expect(rolledBack.entries[KEY]!.comments!['a'].status).toBe('open')
    expect(rolledBack.pendingTransactions).toEqual({})
  })

  it('does not roll back once a newer transaction owns the comment', () => {
    const previous = comment({_id: 'a', status: 'open'})
    const pending = setPendingTransaction('a', 'tx-2')(stateWith([previous]))
    const optimistic = applyCommentUpdate('a', {status: 'resolved'})(pending)

    expect(rollbackCommentUpdate('a', 'tx-1', previous)(optimistic)).toBe(optimistic)
  })
})
