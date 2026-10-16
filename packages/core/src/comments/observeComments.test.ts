import {type ListenEvent, type SanityClient} from '@sanity/client'
import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {commentTarget, storedComment, TARGET_REF} from './__fixtures__/comments'
import {type CommentsEvent, observeComments} from './observeComments'
import {type StoredComment} from './types'

const WELCOME = {type: 'welcome'} as ListenEvent<StoredComment>

const FILTER = '_type == "sanity.comment" && target.document._ref == $targetRef'
const PARAMS = {targetRef: TARGET_REF}

/** What the shared listener carries, which is every comment in the organization. */
let events$: Subject<ListenEvent<StoredComment>>
let fetches: Subject<StoredComment[]>[]
let comments: {fetch: ReturnType<typeof vi.fn>}
let client: SanityClient

beforeEach(() => {
  events$ = new Subject()
  fetches = []
  comments = {
    fetch: vi.fn(() => {
      const fetch$ = new Subject<StoredComment[]>()
      fetches.push(fetch$)
      return fetch$
    }),
  }

  client = {
    observable: {collaboration: {comments}},
  } as unknown as SanityClient
})

/** Stands in for the compiled filter: this list holds comments on `doc-1`. */
function onTargetDocument(comment: StoredComment): boolean {
  return comment.target.document._ref === TARGET_REF
}

function collect(matches: (comment: StoredComment) => boolean = onTargetDocument) {
  const events: CommentsEvent[] = []
  const subscription = observeComments({
    client,
    events$,
    filter: FILTER,
    params: PARAMS,
    matches,
  }).subscribe((event) => events.push(event))
  return {events, subscription}
}

function mutation(
  transition: 'appear' | 'update' | 'disappear',
  documentId: string,
  result?: StoredComment,
): ListenEvent<StoredComment> {
  return {
    type: 'mutation',
    transition,
    documentId,
    result,
    transactionId: `tx-${documentId}`,
  } as ListenEvent<StoredComment>
}

/** A comment on a document this list does not cover. */
function elsewhere(id: string): StoredComment {
  return storedComment({
    _id: id,
    target: commentTarget({
      document: {_ref: 'dataset:p.d:other', _type: 'globalDocumentReference', _weak: true},
    }),
  })
}

describe('observeComments', () => {
  it('fetches a snapshot when the listener connects', () => {
    const {events} = collect()

    events$.next(WELCOME)
    fetches[0].next([storedComment({_id: 'a'})])

    expect(events).toEqual([{type: 'snapshot', comments: [storedComment({_id: 'a'})]}])
    expect(comments.fetch).toHaveBeenCalledWith(`*[${FILTER}] | order(_createdAt desc)`, PARAMS, {
      tag: 'comments.list',
    })
  })

  it('maps appear, update, and disappear events', () => {
    const {events} = collect()
    events$.next(WELCOME)
    fetches[0].next([])
    fetches[0].complete()

    const created = storedComment({_id: 'a'})
    const edited = storedComment({_id: 'a', status: 'resolved'})

    events$.next(mutation('appear', 'a', created))
    events$.next(mutation('update', 'a', edited))
    events$.next(mutation('disappear', 'a'))

    expect(events.slice(1)).toEqual([
      {type: 'appear', comment: created},
      {type: 'update', comment: edited, transactionId: 'tx-a'},
      {type: 'disappear', commentId: 'a'},
    ])
  })

  it('ignores a comment that belongs to another list', () => {
    const {events} = collect()
    events$.next(WELCOME)
    fetches[0].next([])

    events$.next(mutation('appear', 'b', elsewhere('b')))
    events$.next(mutation('update', 'b', elsewhere('b')))

    expect(events).toHaveLength(1)
  })

  it('reports a comment edited out of the filter as gone from this list', () => {
    const {events} = collect()
    events$.next(WELCOME)
    fetches[0].next([storedComment({_id: 'a'})])

    // Still a comment, just no longer one of ours.
    events$.next(mutation('update', 'a', elsewhere('a')))

    expect(events.slice(1)).toEqual([{type: 'disappear', commentId: 'a'}])

    // And having left, it does not leave again.
    events$.next(mutation('update', 'a', elsewhere('a')))
    expect(events).toHaveLength(2)
  })

  it('reports a comment edited into the filter as newly arrived', () => {
    const {events} = collect()
    events$.next(WELCOME)
    fetches[0].next([])

    const arrived = storedComment({_id: 'a'})
    events$.next(mutation('update', 'a', arrived))

    expect(events.slice(1)).toEqual([{type: 'appear', comment: arrived}])
  })

  it('ignores a mutation that carries no document', () => {
    const {events} = collect()
    events$.next(WELCOME)
    fetches[0].next([])

    events$.next(mutation('update', 'a'))

    expect(events).toHaveLength(1)
  })

  it('reads a mutation that arrives while the snapshot is still loading', () => {
    // The Studio loses this one: it awaits the fetch inside the event handler,
    // so the older snapshot overwrites the newer comment. Held unread until the
    // snapshot says what the list holds, because that is what decides whether a
    // mutation is an arrival or a change.
    const {events} = collect()
    events$.next(WELCOME)

    const created = storedComment({_id: 'late'})
    events$.next(mutation('appear', 'late', created))

    expect(events).toEqual([])

    fetches[0].next([storedComment({_id: 'a'})])

    expect(events).toEqual([
      {type: 'snapshot', comments: [storedComment({_id: 'a'})]},
      {type: 'appear', comment: created},
    ])
  })

  it('reads a delete that races the snapshot carrying the comment', () => {
    const {events} = collect()
    events$.next(WELCOME)

    events$.next(mutation('disappear', 'a'))
    fetches[0].next([storedComment({_id: 'a'})])

    expect(events.slice(1)).toEqual([{type: 'disappear', commentId: 'a'}])
  })

  it('abandons an in-flight fetch when the listener reconnects', () => {
    const {events} = collect()
    events$.next(WELCOME)
    expect(fetches).toHaveLength(1)

    events$.next(WELCOME)
    expect(fetches).toHaveLength(2)

    // The first connection's snapshot is stale by now and must not be applied.
    expect(fetches[0].observed).toBe(false)

    fetches[0].next([storedComment({_id: 'stale'})])
    expect(events).toEqual([])

    fetches[1].next([storedComment({_id: 'fresh'})])
    expect(events).toEqual([{type: 'snapshot', comments: [storedComment({_id: 'fresh'})]}])
  })

  it('reports a failed snapshot without killing the stream', () => {
    const {events} = collect()
    events$.next(WELCOME)

    const error = new Error('boom')
    fetches[0].error(error)

    expect(events).toEqual([{type: 'error', error}])

    // A later reconnect still recovers.
    events$.next(WELCOME)
    fetches[1].next([])
    expect(events).toHaveLength(2)
  })

  it('stops reading the listener when unsubscribed', () => {
    const {subscription} = collect()
    events$.next(WELCOME)
    subscription.unsubscribe()

    expect(events$.observed).toBe(false)
  })
})
