import {type ListenEvent, type SanityClient} from '@sanity/client'
import {BehaviorSubject, map, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {AuthStateType} from '../auth/authStateType'
import {type AuthState, setAuthToken} from '../auth/authStore'
import {type DocumentResource} from '../config/sanityConfig'
import {bindActionByResource} from '../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {commentTarget, ORGANIZATION_ID, storedComment} from './__fixtures__/comments'
import {updateComment} from './commentActions'
import {observeCommentsClientForResource} from './commentsClient'
import {buildListenQuery, TYPE_FILTER} from './commentsConstants'
import {
  getCommentsQueryOptionsKey,
  getDocumentCommentsOptionsKey,
  parseCommentsQueryOptionsKey,
  parseDocumentCommentsOptionsKey,
} from './commentsOptions'
import {
  commentsStore,
  getCommentsErrorState,
  getCommentsQueryErrorState,
  getCommentsQueryState,
  getCommentsState,
  getCommentThreadsState,
  resolveComments,
  resolveCommentsQuery,
  resolveCommentThreads,
  toDocumentCommentsKey,
} from './commentsStore'
import {setPendingTransaction} from './reducers'
import {type StoredComment} from './types'

/** Auth, which a test can hold at `/users/me` loading or settle without a user. */
let authState$: BehaviorSubject<AuthState>

function loggedIn(currentUser: {id: string} | null): AuthState {
  return {type: AuthStateType.LOGGED_IN, token: 't', currentUser} as AuthState
}

vi.mock('../auth/authStore', async (importOriginal) => {
  const userOf = (authState: AuthState) =>
    authState.type === AuthStateType.LOGGED_IN ? authState.currentUser : null
  return {
    ...(await importOriginal<typeof import('../auth/authStore')>()),
    getAuthState: vi.fn(() => ({
      observable: authState$,
      getCurrent: () => authState$.getValue(),
      subscribe: () => () => {},
    })),
    getCurrentUserState: vi.fn(() => ({
      observable: authState$.pipe(map(userOf)),
      getCurrent: () => userOf(authState$.getValue()),
      subscribe: () => () => {},
    })),
  }
})

vi.mock('./commentsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./commentsClient')>()),
  observeCommentsClientForResource: vi.fn(() => client$),
  observeCommentsClient: vi.fn(() => client$),
  observeCommentsOrganizationId: vi.fn(() => of(ORGANIZATION_ID)),
}))

const WELCOME = {type: 'welcome'} as ListenEvent<StoredComment>

/** Lets a test seed a pending transaction the way the write actions will. */
const markPending = bindActionByResource(
  commentsStore,
  ({state}, options: {resource?: DocumentResource; commentId: string; transactionId: string}) =>
    state.set(
      'setPendingTransaction',
      setPendingTransaction(options.commentId, options.transactionId),
    ),
)

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

let instance: SanityInstance
let listeners: Map<string, Subject<ListenEvent<StoredComment>>>
let fetches: Subject<StoredComment[]>[]
let client$: BehaviorSubject<SanityClient>
let client: SanityClient
/** The write half of the client, for the tests that need a write in flight. */
let writes: {update: ReturnType<typeof vi.fn>}

/**
 * Keyed on query *and* params, so that a list opening a listener of its own is
 * visible as one. Every list that can be matched locally shares the one keyed
 * on the organization-wide filter.
 */
function listenerFor(query: string, params: Record<string, unknown>) {
  const key = `${query}|${JSON.stringify(params)}`
  const existing = listeners.get(key)
  if (existing) return existing
  const subject = new Subject<ListenEvent<StoredComment>>()
  listeners.set(key, subject)
  return subject
}

/** The listener every locally matchable list reads from. */
function sharedListener() {
  return listenerFor(buildListenQuery(TYPE_FILTER), {})
}

beforeEach(() => {
  authState$ = new BehaviorSubject(loggedIn({id: 'user-1'}))
  listeners = new Map()
  fetches = []

  const comments = {
    listen: vi.fn((query: string, params: Record<string, unknown>) => listenerFor(query, params)),
    fetch: vi.fn(() => {
      const fetch$ = new Subject<StoredComment[]>()
      fetches.push(fetch$)
      return fetch$
    }),
  }

  writes = {update: vi.fn().mockResolvedValue(undefined)}

  client = {
    collaboration: {comments: writes},
    observable: {collaboration: {comments}},
  } as unknown as SanityClient

  client$ = new BehaviorSubject<SanityClient>(client)
  vi.mocked(observeCommentsClientForResource).mockReset().mockReturnValue(client$)

  instance = createSanityInstance({projectId: 'p', dataset: 'd'})
})

afterEach(() => {
  instance.dispose()
})

/**
 * Connects the listener, which is what sets every list fetching.
 *
 * Once per listener: a second welcome is a reconnect, and would have every list
 * already reading throw its fetch away and start another.
 */
const welcomed = new WeakSet<Subject<ListenEvent<StoredComment>>>()
function connect() {
  const listener = sharedListener()
  if (welcomed.has(listener)) return
  welcomed.add(listener)
  listener.next(WELCOME)
}

/** Feeds a snapshot to one of the lists reading, in the order they started. */
function snapshot(comments: StoredComment[], index = 0) {
  connect()
  fetches[index].next(comments)
}

describe('getDocumentCommentsOptionsKey', () => {
  it('round-trips the options it is given', () => {
    const options = {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
      fieldPath: 'title',
      status: 'resolved' as const,
      scope: 'all' as const,
    }

    expect(parseDocumentCommentsOptionsKey(getDocumentCommentsOptionsKey(options))).toEqual(options)
  })

  it('gives a path array and its string form the same key', () => {
    expect(
      getDocumentCommentsOptionsKey({...HANDLE, fieldPath: ['body', {_key: 'intro'}, 'content']}),
    ).toBe(getDocumentCommentsOptionsKey({...HANDLE, fieldPath: 'body[_key=="intro"].content'}))
  })

  it('separates lists that differ only by one option', () => {
    const keys = new Set([
      getDocumentCommentsOptionsKey(HANDLE),
      getDocumentCommentsOptionsKey({...HANDLE, fieldPath: ''}),
      getDocumentCommentsOptionsKey({...HANDLE, fieldPath: 'title'}),
      getDocumentCommentsOptionsKey({...HANDLE, status: 'open'}),
      getDocumentCommentsOptionsKey({...HANDLE, documentId: 'doc-2'}),
      getDocumentCommentsOptionsKey({...HANDLE, scope: 'all'}),
    ])

    expect(keys.size).toBe(6)
  })
})

describe('getCommentsQueryOptionsKey', () => {
  it('round-trips the options it is given', () => {
    const options = {filter: 'status == "open"', params: {userId: 'user-1'}}

    expect(parseCommentsQueryOptionsKey(getCommentsQueryOptionsKey(options))).toEqual(options)
  })

  it('separates queries that differ only by params', () => {
    const filter = 'authorId == $userId'

    expect(getCommentsQueryOptionsKey({filter, params: {userId: 'a'}})).not.toBe(
      getCommentsQueryOptionsKey({filter, params: {userId: 'b'}}),
    )
  })
})

describe('getCommentsState', () => {
  it('is undefined until the first snapshot arrives', () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    expect(source.getCurrent()).toBe(undefined)
  })

  it('returns every comment flat, newest first, replies included', () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    snapshot([
      storedComment({_id: 'a', _createdAt: '2026-01-01T00:00:00Z'}),
      storedComment({_id: 'b', _createdAt: '2026-02-01T00:00:00Z', parentCommentId: 'a'}),
    ])

    expect(source.getCurrent()!.map((comment) => comment.id)).toEqual(['b', 'a'])
  })

  it('filters replies individually, unlike the thread read', () => {
    // A resolved parent carries its replies along when read as a thread. Read
    // flat there is nothing to carry, so the filter applies comment by comment.
    const source = getCommentsState(instance, {...HANDLE, status: 'resolved'})
    source.subscribe()

    snapshot([
      storedComment({_id: 'a', status: 'resolved'}),
      storedComment({_id: 'b', parentCommentId: 'a'}),
    ])

    expect(source.getCurrent()!.map((comment) => comment.id)).toEqual(['a'])
  })

  it('shares one list with the thread read of the same document', () => {
    getCommentsState(instance, HANDLE).subscribe()
    getCommentThreadsState(instance, HANDLE).subscribe()
    connect()

    expect(fetches).toHaveLength(1)
  })
})

describe('getCommentThreadsState', () => {
  it('is undefined until the first snapshot arrives', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()

    expect(source.getCurrent()).toBe(undefined)
  })

  it('groups a document’s comments into threads once someone reads them', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()

    snapshot([storedComment({_id: 'a'}), storedComment({_id: 'b', parentCommentId: 'a'})])

    expect(source.getCurrent()).toMatchObject([
      {threadId: 'thread-1', parentComment: {id: 'a'}, replies: [{id: 'b'}], commentsCount: 2},
    ])
  })

  it('reads the document by its global reference, whichever form was asked for', () => {
    getCommentThreadsState(instance, HANDLE).subscribe()
    connect()

    expect(client.observable.collaboration.comments.fetch).toHaveBeenCalledWith(
      expect.stringContaining('target.document._ref == $targetRef'),
      {targetRef: 'dataset:p.d:doc-1'},
      expect.objectContaining({tag: 'comments.list'}),
    )
  })

  it('opens one listener for the organization rather than one per list', () => {
    getCommentThreadsState(instance, HANDLE).subscribe()
    getCommentThreadsState(instance, {...HANDLE, documentId: 'doc-2'}).subscribe()
    getCommentsQueryState(instance, {filter: 'status == "open"'}).subscribe()
    connect()

    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledTimes(1)
    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledWith(
      '*[_type == "sanity.comment"]',
      {},
      expect.objectContaining({tag: 'comments.listen'}),
    )
    // Which comments belong where is still a question per list.
    expect(fetches).toHaveLength(3)
  })

  it('shares one listener between resources in an organization, each list keeping its own', () => {
    const staging: DocumentResource = {projectId: 'p', dataset: 'staging'}
    const production = getCommentThreadsState(instance, HANDLE)
    const other = getCommentThreadsState(instance, {...HANDLE, resource: staging})
    production.subscribe()
    other.subscribe()
    snapshot([], 0)
    snapshot([], 1)

    // The API routes a listen by organization, so a second dataset would only
    // carry the same stream again.
    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledTimes(1)

    // That stream carries both datasets' comments, and the target reference is
    // what keeps each list to its own.
    sharedListener().next({
      type: 'mutation',
      transition: 'appear',
      documentId: 'staged',
      result: storedComment({
        _id: 'staged',
        target: commentTarget({
          document: {
            _ref: 'dataset:p.staging:doc-1',
            _type: 'globalDocumentReference',
            _weak: true,
          },
        }),
      }),
    } as ListenEvent<StoredComment>)

    expect(production.getCurrent()).toEqual([])
    expect(other.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['staged'])
  })

  it('keeps a listener of its own for a filter it cannot match locally', () => {
    // A dereference cannot be answered against the one comment an event
    // carries, so this list stays on a listener the server filters.
    getCommentsQueryState(instance, {filter: 'target.document->._id == "doc-1"'}).subscribe()

    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledWith(
      expect.stringContaining('target.document->._id'),
      {},
      expect.anything(),
    )
  })

  it('follows the server for a list on a listener of its own', () => {
    const source = getCommentsQueryState(instance, {filter: 'target.document->._id == "doc-1"'})
    source.subscribe()

    const dedicated = Array.from(listeners.values())[0]!
    dedicated.next(WELCOME)
    fetches[0].next([storedComment({_id: 'a'})])

    // The server decided what belongs here, so what it sends is taken at its
    // word rather than put to a filter this side cannot answer.
    dedicated.next({
      type: 'mutation',
      transition: 'appear',
      documentId: 'b',
      result: storedComment({_id: 'b'}),
      transactionId: 'tx-1',
    } as ListenEvent<StoredComment>)

    expect(source.getCurrent()!.map((comment) => comment.id)).toEqual(['a', 'b'])
  })

  it('sorts newest thread first', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()

    snapshot([
      storedComment({_id: 'a', _createdAt: '2026-01-01T00:00:00Z', threadId: 'thread-a'}),
      storedComment({_id: 'b', _createdAt: '2026-02-01T00:00:00Z', threadId: 'thread-b'}),
    ])

    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['b', 'a'])
  })

  it('filters by field path', () => {
    const source = getCommentThreadsState(instance, {...HANDLE, fieldPath: 'title'})
    source.subscribe()

    snapshot([
      storedComment({_id: 'a', target: commentTarget({path: {field: 'title'}})}),
      storedComment({_id: 'b', threadId: 'thread-2'}),
    ])

    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['a'])
  })

  it('matches the field path exactly rather than by prefix', () => {
    // Nothing writes an empty path any more, but the filter is still an exact
    // match, so it must not sweep up every comment on the document.
    const source = getCommentThreadsState(instance, {...HANDLE, fieldPath: ''})
    source.subscribe()

    snapshot([
      storedComment({_id: 'a', target: commentTarget({path: {field: 'title'}})}),
      storedComment({_id: 'b', threadId: 'thread-2', target: commentTarget({path: undefined})}),
    ])

    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['b'])
  })

  it('filters by the parent status without dropping replies', () => {
    const source = getCommentThreadsState(instance, {...HANDLE, status: 'resolved'})
    source.subscribe()

    snapshot([
      storedComment({_id: 'parent', status: 'resolved'}),
      storedComment({_id: 'reply', parentCommentId: 'parent', status: 'open'}),
    ])

    expect(source.getCurrent()).toMatchObject([
      {parentComment: {id: 'parent'}, replies: [{id: 'reply'}], commentsCount: 2},
    ])
  })

  it('returns the same array on repeated reads', () => {
    // A fresh array from one read to the next would make useSyncExternalStore
    // re-render without end.
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()

    snapshot([storedComment({_id: 'a'})])

    expect(source.getCurrent()).toBe(source.getCurrent())
  })

  it('returns the same array when an unrelated document loads', () => {
    // Every state change re-runs the selector, so without a cache keyed on the
    // data, one document loading would re-render readers of every other one.
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])
    const before = source.getCurrent()

    const other = getCommentThreadsState(instance, {...HANDLE, documentId: 'doc-2'})
    other.subscribe()
    snapshot([storedComment({_id: 'b'})], 1)

    expect(source.getCurrent()).toBe(before)
  })
})

describe('scope', () => {
  it('pools draft and published by default, excluding version documents', () => {
    getCommentThreadsState(instance, HANDLE).subscribe()
    connect()

    expect(client.observable.collaboration.comments.fetch).toHaveBeenCalledWith(
      expect.stringContaining('!string::startsWith(target.sourceDocumentId, "versions.")'),
      {targetRef: 'dataset:p.d:doc-1'},
      expect.anything(),
    )
  })

  it('shares one list between a draft and its published document', () => {
    getCommentThreadsState(instance, HANDLE).subscribe()
    getCommentThreadsState(instance, {...HANDLE, documentId: 'drafts.doc-1'}).subscribe()
    connect()

    expect(fetches).toHaveLength(1)
  })

  it('pins to the release version under a release perspective', () => {
    getCommentThreadsState(instance, {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
    }).subscribe()
    connect()

    expect(client.observable.collaboration.comments.fetch).toHaveBeenCalledWith(
      expect.stringContaining('target.sourceDocumentId == $sourceDocumentId'),
      {targetRef: 'dataset:p.d:doc-1', sourceDocumentId: 'versions.summer.doc-1'},
      expect.anything(),
    )
  })

  it('keeps a release’s comments apart from the default ones', () => {
    const base = getCommentThreadsState(instance, HANDLE)
    const release = getCommentThreadsState(instance, {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
    })
    base.subscribe()
    release.subscribe()
    connect()

    expect(fetches).toHaveLength(2)

    snapshot([storedComment({_id: 'a'})])
    snapshot([storedComment({_id: 'b'})], 1)

    expect(base.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['a'])
    expect(release.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['b'])
  })

  it('keeps a content variant’s comments to themselves', () => {
    // A variant document is `versions.{scopeId}.{groupId}`, where the scope is a
    // hash rather than a release name, so it reads as a version id and gets a
    // list of its own the way a release does.
    getCommentThreadsState(instance, {
      ...HANDLE,
      documentId: 'versions.aB3xY9zQ1mN7pR2s.doc-1',
    }).subscribe()
    connect()

    expect(client.observable.collaboration.comments.fetch).toHaveBeenCalledWith(
      expect.stringContaining('target.sourceDocumentId == $sourceDocumentId'),
      {
        targetRef: 'dataset:p.d:doc-1',
        sourceDocumentId: 'versions.aB3xY9zQ1mN7pR2s.doc-1',
      },
      expect.anything(),
    )
  })

  it('pins to the exact id passed when asked for', () => {
    getCommentThreadsState(instance, {
      ...HANDLE,
      documentId: 'drafts.doc-1',
      scope: 'exact',
    }).subscribe()
    connect()

    // The draft id, not the published one: `exact` is the scope for "only what
    // was written against precisely this".
    expect(client.observable.collaboration.comments.fetch).toHaveBeenCalledWith(
      expect.stringContaining('target.sourceDocumentId == $sourceDocumentId'),
      {targetRef: 'dataset:p.d:doc-1', sourceDocumentId: 'drafts.doc-1'},
      expect.anything(),
    )
  })

  it('pools draft and published under a non-release perspective override', () => {
    // The pooled list is what a caller viewing a release reaches for by naming a
    // perspective of their own; there is no separate scope value for it.
    const released = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      perspective: {releaseName: 'summer'},
    })

    getCommentThreadsState(released, {...HANDLE, perspective: 'drafts'}).subscribe()
    connect()

    expect(client.observable.collaboration.comments.fetch).toHaveBeenCalledWith(
      expect.stringContaining('!string::startsWith(target.sourceDocumentId, "versions.")'),
      {targetRef: 'dataset:p.d:doc-1'},
      expect.anything(),
    )

    released.dispose()
  })

  it('filters on the document alone when asked for all of them', () => {
    getCommentThreadsState(instance, {...HANDLE, scope: 'all'}).subscribe()
    connect()

    const [query, params] = vi.mocked(client.observable.collaboration.comments.fetch).mock.calls[0]

    expect(query).not.toContain('sourceDocumentId')
    expect(params).toEqual({targetRef: 'dataset:p.d:doc-1'})
  })

  it('refuses a malformed document id whatever the scope', () => {
    // `'all'` and `'exact'` resolve without needing the id parsed, so the
    // reference is the only thing that looks at it on those paths. Left
    // unchecked they would open a listener on a filter nothing can match and
    // report an empty list instead of the mistake.
    for (const scope of ['perspective', 'exact', 'all'] as const) {
      expect(() =>
        toDocumentCommentsKey(instance, {
          ...HANDLE,
          documentId: 'doc 1',
          scope,
          resource: {projectId: 'p', dataset: 'd'},
        }),
      ).toThrow()
    }
  })
})

describe('getCommentsQueryState', () => {
  it('runs a caller’s filter and returns a flat list', () => {
    const source = getCommentsQueryState(instance, {
      filter: 'authorId == $userId',
      params: {userId: 'user-1'},
    })
    source.subscribe()

    snapshot([storedComment({_id: 'a'}), storedComment({_id: 'b', parentCommentId: 'a'})])

    // Flat: replies are comments too, and an arbitrary filter has no reason to
    // return whole threads.
    expect(source.getCurrent()!.map((comment) => comment.id)).toEqual(['a', 'b'])
    expect(client.observable.collaboration.comments.fetch).toHaveBeenCalledWith(
      '*[_type == "sanity.comment" && (authorId == $userId)] | order(_createdAt desc)',
      {userId: 'user-1'},
      expect.anything(),
    )
  })

  it('addresses one entry however the params were ordered', () => {
    getCommentsQueryState(instance, {
      filter: 'a == $one && b == $two',
      params: {one: '1', two: '2'},
    }).subscribe()
    getCommentsQueryState(instance, {
      filter: 'a == $one && b == $two',
      params: {two: '2', one: '1'},
    }).subscribe()
    connect()

    expect(fetches).toHaveLength(1)
  })

  it('waits for the user before following a filter on identity()', () => {
    authState$.next(loggedIn(null))
    const source = getCommentsQueryState(instance, {filter: '_system.createdBy == identity()'})
    source.subscribe()

    // Started now, it would drop every matching create the listener carried
    // until the user loaded, and nothing would bring them back.
    expect(listeners.size).toBe(0)

    authState$.next(loggedIn({id: 'user-1'}))
    snapshot([])
    sharedListener().next({
      type: 'mutation',
      transition: 'appear',
      documentId: 'mine',
      result: storedComment({_id: 'mine', _system: {createdBy: 'user-1'}}),
      transactionId: 'tx-mine',
    } as ListenEvent<StoredComment>)

    expect(source.getCurrent()!.map((comment) => comment.id)).toEqual(['mine'])
  })

  it('lets the server answer a filter on identity() when there is no user', () => {
    // Logged out, or `/users/me` failed: no user is coming, so waiting for one
    // would leave the list suspended for good.
    authState$.next({type: AuthStateType.LOGGED_OUT, isDestroyingSession: false} as AuthState)
    const source = getCommentsQueryState(instance, {filter: '_system.createdBy == identity()'})
    source.subscribe()

    snapshot([])

    expect(source.getCurrent()).toEqual([])
  })

  it('reads a filter on identity() again for a different user', () => {
    const source = getCommentsQueryState(instance, {filter: '_system.createdBy == identity()'})
    source.subscribe()
    snapshot([storedComment({_id: 'a-1', _system: {createdBy: 'user-1'}})])
    expect(source.getCurrent()!.map((comment) => comment.id)).toEqual(['a-1'])

    // Someone else signs in: what identity() selects has changed, so the list
    // is fetched again rather than kept from the previous user.
    authState$.next(loggedIn({id: 'user-2'}))
    connect()
    expect(fetches).toHaveLength(2)
    fetches[1].next([storedComment({_id: 'b-1', _system: {createdBy: 'user-2'}})])

    expect(source.getCurrent()!.map((comment) => comment.id)).toEqual(['b-1'])
  })

  it('reads through a client for the resource it is bound to', () => {
    // The organization is resolved from the resource rather than keyed on, so
    // one filter is one entry and one listener.
    getCommentsQueryState(instance, {filter: 'status == "open"'}).subscribe()
    getCommentsQueryState(instance, {filter: 'status == "open"'}).subscribe()

    expect(
      vi.mocked(observeCommentsClientForResource).mock.calls.map(([, resource]) => resource),
    ).toEqual([{projectId: 'p', dataset: 'd'}])
  })
})

describe('transaction reconciliation', () => {
  function updateEvent(transactionId: string, status: StoredComment['status']) {
    return {
      type: 'mutation',
      transition: 'update',
      documentId: 'a',
      result: storedComment({_id: 'a', status}),
      transactionId,
    } as ListenEvent<StoredComment>
  }

  function loaded() {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])
    return source
  }

  it('ignores an echo from a superseded transaction', () => {
    const source = loaded()
    markPending(instance, {commentId: 'a', transactionId: 'tx-2'})

    sharedListener().next(updateEvent('tx-1', 'resolved'))

    expect(source.getCurrent()![0].status).toBe('open')
  })

  it('applies the echo we were waiting for', () => {
    const source = loaded()
    markPending(instance, {commentId: 'a', transactionId: 'tx-2'})

    sharedListener().next(updateEvent('tx-2', 'resolved'))

    expect(source.getCurrent()![0].status).toBe('resolved')
  })

  it('applies updates from other clients when nothing is pending', () => {
    const source = loaded()

    sharedListener().next(updateEvent('tx-elsewhere', 'resolved'))

    expect(source.getCurrent()![0].status).toBe('resolved')
  })

  it('keeps a comment our newer write reopened when an older echo resolves it', () => {
    // We reopened it (tx-2, in flight). The echo of the earlier resolve (tx-1)
    // takes it out of this open-only list, but it is the stale one.
    const source = getCommentsQueryState(instance, {filter: 'status == "open"'})
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])
    markPending(instance, {commentId: 'a', transactionId: 'tx-2'})

    sharedListener().next(updateEvent('tx-1', 'resolved'))

    expect(source.getCurrent()!.map((comment) => comment.id)).toEqual(['a'])
  })

  it('takes a comment out when our newer write also leaves the filter', () => {
    // An older echo (tx-1) is dropped because tx-2 is in flight. When tx-2's
    // own echo arrives, also outside the filter, the comment must still leave.
    const source = getCommentsQueryState(instance, {filter: 'status == "open"'})
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])
    markPending(instance, {commentId: 'a', transactionId: 'tx-2'})

    sharedListener().next(updateEvent('tx-1', 'resolved'))
    sharedListener().next(updateEvent('tx-2', 'resolved'))

    expect(source.getCurrent()).toEqual([])
  })

  it('takes a comment out when our own write is what edits it out', () => {
    const source = getCommentsQueryState(instance, {filter: 'status == "open"'})
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])
    markPending(instance, {commentId: 'a', transactionId: 'tx-2'})

    sharedListener().next(updateEvent('tx-2', 'resolved'))

    expect(source.getCurrent()).toEqual([])
  })

  it('does not apply an older update that is classified as appearing', () => {
    const source = getCommentsQueryState(instance, {filter: 'status == "resolved"'})
    source.subscribe()
    snapshot([])
    markPending(instance, {commentId: 'a', transactionId: 'tx-2'})

    sharedListener().next(updateEvent('tx-1', 'resolved'))

    expect(source.getCurrent()).toEqual([])
  })

  it('rolls a failed write back onto the change it held back', async () => {
    const source = loaded()

    let rejectWrite: (error: unknown) => void = () => {}
    writes.update.mockReturnValue(new Promise((_resolve, reject) => (rejectWrite = reject)))

    const write = updateComment(instance, {
      commentId: 'a',
      message: [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'mine'}]}],
    })
    const failed = expect(write).rejects.toThrow('nope')

    // Someone else resolves the thread while our edit is in flight. Applying
    // their echo now would undo our edit on screen, so it is held back.
    sharedListener().next(updateEvent('tx-elsewhere', 'resolved'))
    expect(source.getCurrent()![0].status).toBe('open')

    rejectWrite(new Error('nope'))
    await failed

    // Their change is committed and no further event is coming for it, so the
    // rollback has to land on it rather than on the comment as we found it.
    expect(source.getCurrent()![0].status).toBe('resolved')
  })
})

describe('a comment leaving one list', () => {
  const THREAD = [storedComment({_id: 'a'}), storedComment({_id: 'b', parentCommentId: 'a'})]

  function disappear(commentId: string) {
    sharedListener().next({
      type: 'mutation',
      transition: 'disappear',
      documentId: commentId,
    } as ListenEvent<StoredComment>)
  }

  /** Resolves a comment, which is what takes it out of an open-only list. */
  function resolve(commentId: string) {
    sharedListener().next({
      type: 'mutation',
      transition: 'update',
      documentId: commentId,
      result: storedComment({_id: commentId, status: 'resolved'}),
      transactionId: 'tx-1',
    } as ListenEvent<StoredComment>)
  }

  /** The document's threads and an open-only query, both holding one thread. */
  function twoLists() {
    const document = getCommentThreadsState(instance, HANDLE)
    const query = getCommentsQueryState(instance, {filter: 'status == "open"'})
    document.subscribe()
    query.subscribe()

    snapshot(THREAD)
    snapshot(THREAD, 1)

    return {document, query}
  }

  it('leaves the lists that still match it alone', () => {
    const {document, query} = twoLists()

    // One event, read against each list's own filter: the comment has left the
    // open-only query, and merely changed in the document's unfiltered list.
    resolve('a')

    expect(query.getCurrent()!.map((comment) => comment.id)).toEqual(['b'])
    expect(document.getCurrent()).toMatchObject([{parentComment: {id: 'a'}, replies: [{id: 'b'}]}])
  })

  it('keeps the replies of the comment that left', () => {
    // The replies were not mutated, so no event of their own is coming. Dropping
    // them here would lose them until the next reconnect.
    const {query} = twoLists()

    resolve('a')

    expect(query.getCurrent()!.map((comment) => comment.id)).toEqual(['b'])
  })

  it('does not report the same departure twice', () => {
    const {query} = twoLists()

    resolve('a')
    resolve('a')

    expect(query.getCurrent()!.map((comment) => comment.id)).toEqual(['b'])
  })

  it('empties the list when a deleted thread disappears comment by comment', () => {
    const {document} = twoLists()

    disappear('a')
    disappear('b')

    expect(document.getCurrent()).toEqual([])
  })
})

/** Waits for the list to start reading, then answers its snapshot. */
async function loadSnapshot(comments: StoredComment[]) {
  await vi.waitFor(() => expect(listeners.size).toBe(1))
  connect()
  await vi.waitFor(() => expect(fetches).toHaveLength(1))
  fetches[0].next(comments)
}

describe('resolveComments', () => {
  it('starts loading and resolves with the comments', async () => {
    const promise = resolveComments(instance, HANDLE)

    await loadSnapshot([storedComment({_id: 'a'})])

    await expect(promise).resolves.toMatchObject([{id: 'a'}])
  })
})

describe('resolveCommentThreads', () => {
  it('starts loading and resolves with the threads', async () => {
    const promise = resolveCommentThreads(instance, HANDLE)

    await loadSnapshot([storedComment({_id: 'a'})])

    await expect(promise).resolves.toMatchObject([{parentComment: {id: 'a'}}])
  })

  it('rejects when aborted', async () => {
    const controller = new AbortController()
    const promise = resolveCommentThreads(instance, {...HANDLE, signal: controller.signal})

    controller.abort()

    await expect(promise).rejects.toThrow(/aborted/)
  })

  it('stops reading when an abort leaves no readers', async () => {
    const controller = new AbortController()
    const promise = resolveCommentThreads(instance, {...HANDLE, signal: controller.signal})
    await vi.waitFor(() => expect(listeners.size).toBe(1))
    connect()
    await vi.waitFor(() => expect(fetches).toHaveLength(1))

    controller.abort()
    await expect(promise).rejects.toThrow()

    // The shared listener outlives this list by design; what has to go is this
    // list's own reading of it.
    expect(fetches[0].observed).toBe(false)
  })
})

describe('resolveCommentsQuery', () => {
  it('starts loading and resolves with the comments', async () => {
    const promise = resolveCommentsQuery(instance, {filter: 'status == "open"'})

    await loadSnapshot([storedComment({_id: 'a'})])

    await expect(promise).resolves.toMatchObject([{id: 'a'}])
  })
})

describe('listener recovery', () => {
  it('keeps serving a loaded list after its listener fails', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])

    sharedListener().error(new Error('connection failed'))

    // Stale beats gone. Replacing a list someone is reading with an error
    // boundary loses comments that are still perfectly good to show; they just
    // stop updating until a listener comes back.
    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['a'])
  })

  it('surfaces a failure that arrives before anything has loaded', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()

    sharedListener().error(new Error('connection failed'))

    // Nothing to fall back on here, and a reader left suspended forever would
    // say less than the failure does.
    expect(() => source.getCurrent()).toThrow('connection failed')
  })

  it('starts listening again when the client changes after a listener error', () => {
    getCommentThreadsState(instance, HANDLE).subscribe()

    sharedListener().error(new Error('connection failed'))
    listeners.clear()

    client$.next(client)

    expect(listeners.size).toBe(1)
  })

  it('starts listening again when the credential changes after a listener error', () => {
    getCommentThreadsState(instance, HANDLE).subscribe()

    sharedListener().error(new Error('connection failed'))
    listeners.clear()

    // An OAuth refresh keeps the client, so the credential is all that changes.
    setAuthToken(instance, 'renewed-token')

    expect(listeners.size).toBe(1)
  })

  it('reports the failure to every list that was reading the listener', () => {
    const document = getCommentThreadsState(instance, HANDLE)
    const documentError = getCommentsErrorState(instance, HANDLE)
    const query = getCommentsQueryState(instance, {filter: 'status == "open"'})
    const queryError = getCommentsQueryErrorState(instance, {filter: 'status == "open"'})
    document.subscribe()
    query.subscribe()
    snapshot([storedComment({_id: 'a'})])
    snapshot([storedComment({_id: 'a'})], 1)

    sharedListener().error(new Error('connection failed'))

    expect(documentError.getCurrent()).toEqual(new Error('connection failed'))
    expect(queryError.getCurrent()).toEqual(new Error('connection failed'))
  })

  it('reports why a loaded list stopped following the server', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    const errorSource = getCommentsErrorState(instance, HANDLE)
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])

    // Serving a stale list silently would leave an app with no way to say so.
    expect(errorSource.getCurrent()).toBeUndefined()

    sharedListener().error(new Error('connection failed'))

    expect(errorSource.getCurrent()).toEqual(new Error('connection failed'))
  })

  it('clears the report once a listener comes back', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    const errorSource = getCommentsErrorState(instance, HANDLE)
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])

    sharedListener().error(new Error('connection failed'))
    listeners.clear()
    fetches.length = 0
    client$.next(client)
    snapshot([storedComment({_id: 'a'})])

    expect(errorSource.getCurrent()).toBeUndefined()
  })

  it('leaves a failure before the first snapshot to the read itself', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    const errorSource = getCommentsErrorState(instance, HANDLE)
    source.subscribe()

    sharedListener().error(new Error('connection failed'))

    // There is no list to be stale here, so this is a failed read rather than
    // one that has stopped updating.
    expect(errorSource.getCurrent()).toBeUndefined()
    expect(() => source.getCurrent()).toThrow('connection failed')
  })
})
