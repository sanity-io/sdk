import {type ListenEvent, type SanityClient} from '@sanity/client'
import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {storedComment, TARGET_REF} from './commentFixtures'
import {type CommentsEvent, observeComments} from './observeComments'
import {type StoredComment} from './types'

const WELCOME = {type: 'welcome'} as ListenEvent<StoredComment>

const FILTER = '_type == "sanity.comment" && target.document._ref == $targetRef'
const PARAMS = {targetRef: TARGET_REF}

let listen$: Subject<ListenEvent<StoredComment>>
let fetches: Subject<StoredComment[]>[]
let comments: {listen: ReturnType<typeof vi.fn>; fetch: ReturnType<typeof vi.fn>}
let client: SanityClient

beforeEach(() => {
  listen$ = new Subject()
  fetches = []
  comments = {
    listen: vi.fn(() => listen$),
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

function collect() {
  const events: CommentsEvent[] = []
  const subscription = observeComments({client, filter: FILTER, params: PARAMS}).subscribe(
    (event) => events.push(event),
  )
  return {events, subscription}
}

describe('observeComments', () => {
  it('fetches a snapshot when the listener connects', () => {
    const {events} = collect()

    listen$.next(WELCOME)
    fetches[0].next([storedComment({_id: 'a'})])

    expect(events).toEqual([{type: 'snapshot', comments: [storedComment({_id: 'a'})]}])
    expect(comments.fetch).toHaveBeenCalledWith(`*[${FILTER}] | order(_createdAt desc)`, PARAMS, {
      tag: 'comments.list',
    })
  })

  it('listens on the same filter, unordered', () => {
    collect()

    expect(comments.listen).toHaveBeenCalledWith(
      `*[${FILTER}]`,
      PARAMS,
      expect.objectContaining({tag: 'comments.listen', includeResult: true}),
    )
  })

  it('maps appear, update, and disappear events', () => {
    const {events} = collect()
    listen$.next(WELCOME)
    fetches[0].next([])
    fetches[0].complete()

    const created = storedComment({_id: 'a'})
    const edited = storedComment({_id: 'a', status: 'resolved'})

    listen$.next({
      type: 'mutation',
      transition: 'appear',
      documentId: 'a',
      result: created,
      transactionId: 'tx-1',
    } as ListenEvent<StoredComment>)
    listen$.next({
      type: 'mutation',
      transition: 'update',
      documentId: 'a',
      result: edited,
      transactionId: 'tx-2',
    } as ListenEvent<StoredComment>)
    listen$.next({
      type: 'mutation',
      transition: 'disappear',
      documentId: 'a',
    } as ListenEvent<StoredComment>)

    expect(events.slice(1)).toEqual([
      {type: 'appear', comment: created},
      {type: 'update', comment: edited, transactionId: 'tx-2'},
      {type: 'disappear', commentId: 'a'},
    ])
  })

  it('ignores a mutation that carries no document', () => {
    const {events} = collect()
    listen$.next(WELCOME)
    fetches[0].next([])

    listen$.next({
      type: 'mutation',
      transition: 'update',
      documentId: 'a',
      transactionId: 'tx-1',
    } as ListenEvent<StoredComment>)

    expect(events).toHaveLength(1)
  })

  it('keeps a mutation that arrives while the snapshot is still loading', () => {
    // The Studio loses this one: it awaits the fetch inside the event handler,
    // so the older snapshot overwrites the newer comment.
    const {events} = collect()
    listen$.next(WELCOME)

    const created = storedComment({_id: 'late'})
    listen$.next({
      type: 'mutation',
      transition: 'appear',
      documentId: 'late',
      result: created,
      transactionId: 'tx-1',
    } as ListenEvent<StoredComment>)

    expect(events).toEqual([])

    fetches[0].next([storedComment({_id: 'a'})])

    expect(events).toEqual([
      {type: 'snapshot', comments: [storedComment({_id: 'a'})]},
      {type: 'appear', comment: created},
    ])
  })

  it('abandons an in-flight fetch when the listener reconnects', () => {
    const {events} = collect()
    listen$.next(WELCOME)
    expect(fetches).toHaveLength(1)

    listen$.next(WELCOME)
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
    listen$.next(WELCOME)

    const error = new Error('boom')
    fetches[0].error(error)

    expect(events).toEqual([{type: 'error', error}])

    // A later reconnect still recovers.
    listen$.next(WELCOME)
    fetches[1].next([])
    expect(events).toHaveLength(2)
  })

  it('stops listening when unsubscribed', () => {
    const {subscription} = collect()
    listen$.next(WELCOME)
    subscription.unsubscribe()

    expect(listen$.observed).toBe(false)
  })
})
