import {describe, expect, it} from 'vitest'

import {ORGANIZATION_ID, storedComment, TARGET_REF} from './commentFixtures'
import {
  addComment,
  addSubscriber,
  applyCommentUpdate,
  clearPendingTransaction,
  type CommentsStoreState,
  getCommentsKey,
  parseCommentsKey,
  receiveComment,
  recordDroppedEcho,
  removeCommentById,
  removeCommentFromEntry,
  removeSubscriber,
  restoreComments,
  rollbackCommentUpdate,
  setCommentCreateError,
  setComments,
  setCommentsError,
  setPendingTransaction,
} from './reducers'
import {type StoredComment} from './types'

const FILTER = '_type == "sanity.comment" && target.document._ref == $targetRef'

const KEY = getCommentsKey({
  filter: FILTER,
  params: {targetRef: TARGET_REF},
  organizationId: ORGANIZATION_ID,
})

const comment = storedComment

function stateWith(comments: StoredComment[]): CommentsStoreState {
  return setComments(
    KEY,
    comments,
  )({
    entries: {[KEY]: {subscribers: ['sub-1']}},
    pendingCreates: {},
    pendingTransactions: {},
    droppedEchoes: {},
  })
}

/** A second list holding the same comments, as a GROQ query would. */
const OTHER_KEY = getCommentsKey({
  filter: 'status == "open"',
  params: {},
  organizationId: ORGANIZATION_ID,
})

function stateWithBoth(comments: StoredComment[]): CommentsStoreState {
  const both = addSubscriber(OTHER_KEY, 'sub-2')(stateWith(comments))
  return setComments(OTHER_KEY, comments)(both)
}

const emptyState = (): CommentsStoreState => ({
  entries: {},
  pendingCreates: {},
  pendingTransactions: {},
  droppedEchoes: {},
})

describe('comment list keys', () => {
  it('round-trips a filter, its params, and the organization', () => {
    const parts = {
      filter: FILTER,
      params: {targetRef: TARGET_REF},
      organizationId: ORGANIZATION_ID,
    }

    expect(parseCommentsKey(getCommentsKey(parts))).toEqual(parts)
  })

  it('addresses one entry however the params were ordered', () => {
    // The same query written by two callers has to reach one entry, or a write
    // optimistically applied to one list would not show in the other.
    expect(getCommentsKey({filter: FILTER, params: {a: 1, b: 2}, organizationId: 'org-1'})).toBe(
      getCommentsKey({filter: FILTER, params: {b: 2, a: 1}, organizationId: 'org-1'}),
    )
  })

  it('separates entries that differ in any part', () => {
    const keys = new Set([
      getCommentsKey({filter: FILTER, params: {}, organizationId: 'org-1'}),
      getCommentsKey({filter: FILTER, params: {}, organizationId: 'org-2'}),
      getCommentsKey({filter: 'status == "open"', params: {}, organizationId: 'org-1'}),
      getCommentsKey({filter: FILTER, params: {targetRef: TARGET_REF}, organizationId: 'org-1'}),
    ])

    expect(keys.size).toBe(4)
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
      droppedEchoes: {a: comment({_id: 'a'})},
    }

    const next = removeSubscriber(KEY, 'sub-1')(before)

    expect(next.entries).toEqual({})
    expect(next.pendingCreates).toEqual({})
    expect(next.pendingTransactions).toEqual({})
    expect(next.droppedEchoes).toEqual({})
  })

  it('keeps reconciliation state while another entry still holds the comment', () => {
    // A create fans out into every list its target matches, so one of them
    // going away mid-write must not strip the markers the others still need to
    // roll back or to report the failure.
    const before: CommentsStoreState = {
      ...stateWithBoth([comment({_id: 'a'})]),
      pendingCreates: {a: true},
      pendingTransactions: {a: 'tx-1'},
      droppedEchoes: {a: comment({_id: 'a'})},
    }

    const next = removeSubscriber(KEY, 'sub-1')(before)

    expect(next.entries[KEY]).toBeUndefined()
    expect(next.pendingCreates).toEqual({a: true})
    expect(next.pendingTransactions).toEqual({a: 'tx-1'})
    expect(next.droppedEchoes).toHaveProperty('a')
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
    const failed = comment({_id: 'failed', _state: {type: 'createError', error: new Error('nope')}})

    const next = setComments(KEY, [])(stateWith([failed]))

    expect(next.entries[KEY]!.comments!['failed']).toBe(failed)
  })

  it('keeps an in-flight local create that is absent from the snapshot', () => {
    // A snapshot can be in flight while a create is written, and it would come
    // back without the new comment through no fault of the server.
    const optimistic = addComment(KEY, comment({_id: 'pending'}))(stateWith([]))

    const next = setComments(KEY, [])(optimistic)

    expect(next.entries[KEY]!.comments!['pending']).toBeDefined()
  })

  it('stops tracking a create the snapshot now contains', () => {
    const optimistic = addComment(KEY, comment({_id: 'pending'}))(stateWith([]))

    const next = setComments(KEY, [comment({_id: 'pending'})])(optimistic)

    expect(next.pendingCreates).toEqual({})
  })

  it('stores comment ids such as __proto__ as ordinary keys', () => {
    const special = comment({_id: '__proto__'})
    const next = setComments(KEY, [special])(stateWith([]))

    expect(Object.values(next.entries[KEY]!.comments!)).toEqual([special])
  })
})

describe('addComment', () => {
  it('shows the comment and marks it unconfirmed', () => {
    const next = addComment(KEY, comment({_id: 'new'}))(stateWith([]))

    expect(next.entries[KEY]!.comments!['new']).toBeDefined()
    expect(next.pendingCreates).toEqual({new: true})
  })

  it('ignores a create for an entry nobody is reading', () => {
    const empty = emptyState()
    expect(addComment(KEY, comment({_id: 'new'}))(empty)).toBe(empty)
  })

  it('keeps the createdAt the comment first appeared with', () => {
    // A retry that restamped this would send the comment back to the top of a
    // list sorted newest first, every time it was attempted.
    const existing = comment({_id: 'a', _createdAt: '2026-03-03T00:00:00Z'})
    const retried = comment({_id: 'a', _createdAt: '2026-04-04T00:00:00Z'})

    const next = addComment(KEY, retried)(stateWith([existing]))

    expect(next.entries[KEY]!.comments!['a']._createdAt).toBe('2026-03-03T00:00:00Z')
  })

  it('marks a failed comment as retrying when it is added again', () => {
    const failed = comment({_id: 'a', _state: {type: 'createError', error: new Error('nope')}})

    const next = addComment(KEY, comment({_id: 'a'}))(stateWith([failed]))

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

  it('patches every entry holding the comment', () => {
    // A comment can sit in a document list and a GROQ query at once, and an
    // optimistic edit has to show in both.
    const other = getCommentsKey({filter: 'status == "open"', params: {}, organizationId: 'org-1'})
    const before = addSubscriber(other, 'sub-2')(stateWith([comment({_id: 'a'})]))
    const seeded = setComments(other, [comment({_id: 'a'})])(before)

    const next = applyCommentUpdate('a', {status: 'resolved'})(seeded)

    expect(next.entries[KEY]!.comments!['a'].status).toBe('resolved')
    expect(next.entries[other]!.comments!['a'].status).toBe('resolved')
  })
})

describe('removeCommentFromEntry', () => {
  it('removes the comment from the entry that lost it', () => {
    const before = stateWith([comment({_id: 'a'}), comment({_id: 'b'})])

    expect(Object.keys(removeCommentFromEntry(KEY, 'a')(before).entries[KEY]!.comments!)).toEqual([
      'b',
    ])
  })

  it('leaves the comment in the other entries still matching it', () => {
    // A comment edited out of one filter is still in the lists whose filter it
    // matches, and each of those has its own listener to say otherwise.
    const next = removeCommentFromEntry(KEY, 'a')(stateWithBoth([comment({_id: 'a'})]))

    expect(next.entries[KEY]!.comments!).toEqual({})
    expect(next.entries[OTHER_KEY]!.comments!['a']).toBeDefined()
  })

  it('keeps the replies of a comment it removes', () => {
    // Resolving a thread drops its parent out of an open-only filter, and the
    // replies were not mutated, so nothing would ever bring them back.
    const before = stateWith([comment({_id: 'a'}), comment({_id: 'b', parentCommentId: 'a'})])

    expect(Object.keys(removeCommentFromEntry(KEY, 'a')(before).entries[KEY]!.comments!)).toEqual([
      'b',
    ])
  })

  it('drops reconciliation state once no entry holds the comment', () => {
    const before: CommentsStoreState = {
      ...stateWith([comment({_id: 'a'})]),
      pendingCreates: {a: true},
      pendingTransactions: {a: 'tx-1'},
      droppedEchoes: {a: comment({_id: 'a'})},
    }

    const next = removeCommentFromEntry(KEY, 'a')(before)

    expect(next.pendingCreates).toEqual({})
    expect(next.pendingTransactions).toEqual({})
    expect(next.droppedEchoes).toEqual({})
  })

  it('keeps reconciliation state while another entry holds the comment', () => {
    // The in-flight write is still in flight; its marker is what protects it.
    const before: CommentsStoreState = {
      ...stateWithBoth([comment({_id: 'a'})]),
      pendingTransactions: {a: 'tx-1'},
    }

    expect(removeCommentFromEntry(KEY, 'a')(before).pendingTransactions).toEqual({a: 'tx-1'})
  })

  it('leaves state untouched for a comment the entry does not hold', () => {
    const before = stateWith([comment({_id: 'a'})])

    expect(removeCommentFromEntry(KEY, 'missing')(before)).toBe(before)
    expect(removeCommentFromEntry('missing', 'a')(before)).toBe(before)
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

  it('drops reconciliation state for everything it removed', () => {
    const before: CommentsStoreState = {
      ...stateWith([comment({_id: 'a'}), comment({_id: 'b', parentCommentId: 'a'})]),
      pendingCreates: {b: true},
      pendingTransactions: {a: 'tx-1'},
      droppedEchoes: {a: comment({_id: 'a'})},
    }

    const next = removeCommentById('a')(before)

    expect(next.pendingCreates).toEqual({})
    expect(next.pendingTransactions).toEqual({})
    expect(next.droppedEchoes).toEqual({})
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
    // The comment landed, so the create is settled even though the list it was
    // written into is gone.
    const before: CommentsStoreState = {...emptyState(), pendingCreates: {a: true}}

    expect(receiveComment(KEY, comment({_id: 'a'}))(before).pendingCreates).toEqual({})
  })
})

describe('setCommentCreateError', () => {
  it('marks the comment as failed and stops tracking the create', () => {
    const error = new Error('nope')
    const before = addComment(KEY, comment({_id: 'a'}))(stateWith([]))

    const next = setCommentCreateError('a', error)(before)

    expect(next.entries[KEY]!.comments!['a']._state).toEqual({type: 'createError', error})
    expect(next.pendingCreates).toEqual({})
  })

  it('leaves a create alone once it has been confirmed', () => {
    // A failure can arrive after the listener already showed the comment, and
    // marking a comment that exists on the server as failed would offer a retry
    // that duplicates it.
    const before = receiveComment(
      KEY,
      comment({_id: 'a'}),
    )(addComment(KEY, comment({_id: 'a'}))(stateWith([])))

    expect(setCommentCreateError('a', new Error('nope'))(before)).toBe(before)
  })
})

describe('pending transactions', () => {
  it('records and clears the transaction for a comment', () => {
    const set = setPendingTransaction('a', 'tx-1')(emptyState())
    expect(set.pendingTransactions).toEqual({a: 'tx-1'})
    expect(clearPendingTransaction('a', 'tx-1')(set).pendingTransactions).toEqual({})
  })

  it('leaves a newer transaction in place when an earlier one settles', () => {
    // The later write's marker is what keeps the earlier one's echo from
    // overwriting it, and what lets it roll itself back if it fails.
    const set = setPendingTransaction('a', 'tx-2')(setPendingTransaction('a', 'tx-1')(emptyState()))

    expect(clearPendingTransaction('a', 'tx-1')(set)).toBe(set)
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
    // The later write is the one the user is waiting on; undoing it because an
    // earlier one failed would discard an edit they can still see.
    const previous = comment({_id: 'a', status: 'open'})
    const pending = setPendingTransaction('a', 'tx-2')(stateWith([previous]))
    const optimistic = applyCommentUpdate('a', {status: 'resolved'})(pending)

    expect(rollbackCommentUpdate('a', 'tx-1', previous)(optimistic)).toBe(optimistic)
  })
})

describe('echoes held back while a write is in flight', () => {
  const previous = comment({_id: 'a', status: 'open', lastEditedAt: undefined})

  /** Our write in flight, with someone else's committed change held back. */
  function withHeldEcho(echo: StoredComment) {
    const pending = setPendingTransaction('a', 'tx-1')(stateWith([previous]))
    const optimistic = applyCommentUpdate('a', {status: 'resolved'})(pending)
    return recordDroppedEcho(echo)(optimistic)
  }

  it('rolls back onto the held state rather than onto what we had', () => {
    // The other client's write is committed. Restoring our own snapshot would
    // erase it on screen, and no further event is coming to bring it back.
    const echo = comment({_id: 'a', status: 'open', lastEditedAt: '2026-05-05T00:00:00Z'})

    const rolledBack = rollbackCommentUpdate('a', 'tx-1', previous)(withHeldEcho(echo))

    expect(rolledBack.entries[KEY]!.comments!['a']).toBe(echo)
    expect(rolledBack.droppedEchoes).toEqual({})
  })

  it('still rolls back onto our snapshot when nothing was held', () => {
    const pending = setPendingTransaction('a', 'tx-1')(stateWith([previous]))
    const optimistic = applyCommentUpdate('a', {status: 'resolved'})(pending)

    const rolledBack = rollbackCommentUpdate('a', 'tx-1', previous)(optimistic)

    expect(rolledBack.entries[KEY]!.comments!['a'].status).toBe('open')
  })

  it('discards the held state once the write succeeds', () => {
    // Our own echo carries the server's merge of both writes, so the held copy
    // is stale the moment the write lands.
    const held = withHeldEcho(comment({_id: 'a', lastEditedAt: '2026-05-05T00:00:00Z'}))

    expect(clearPendingTransaction('a', 'tx-1')(held).droppedEchoes).toEqual({})
  })

  it('discards the held state once a newer server copy is applied', () => {
    const held = withHeldEcho(comment({_id: 'a', lastEditedAt: '2026-05-05T00:00:00Z'}))

    expect(receiveComment(KEY, comment({_id: 'a'}))(held).droppedEchoes).toEqual({})
  })

  it('keeps only the most recent held state', () => {
    // Events arrive in commit order, so the latest is the server's state and the
    // ones before it are already superseded.
    const first = comment({_id: 'a', lastEditedAt: '2026-05-05T00:00:00Z'})
    const second = comment({_id: 'a', lastEditedAt: '2026-06-06T00:00:00Z'})

    const held = recordDroppedEcho(second)(withHeldEcho(first))

    expect(held.droppedEchoes['a']).toBe(second)
  })
})

describe('restoreComments', () => {
  it('puts back what a failed delete removed', () => {
    const parent = comment({_id: 'a'})
    const reply = comment({_id: 'b', parentCommentId: 'a'})
    const removed = removeCommentById('a')(stateWith([parent, reply]))

    const next = restoreComments([{key: KEY, comments: [parent, reply]}])(removed)

    expect(Object.keys(next.entries[KEY]!.comments!)).toEqual(['a', 'b'])
  })

  it('leaves a comment the listener already brought back alone', () => {
    const parent = comment({_id: 'a'})
    const restored = receiveComment(
      KEY,
      comment({_id: 'a', status: 'resolved'}),
    )(removeCommentById('a')(stateWith([parent])))

    const next = restoreComments([{key: KEY, comments: [parent]}])(restored)

    expect(next.entries[KEY]!.comments!['a'].status).toBe('resolved')
  })

  it('leaves state untouched when the entry is gone', () => {
    const empty = emptyState()
    expect(restoreComments([{key: KEY, comments: [comment({_id: 'a'})]}])(empty)).toBe(empty)
  })
})
