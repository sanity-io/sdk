import {type ListenEvent, type SanityClient} from '@sanity/client'
import {BehaviorSubject, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type DocumentResource} from '../config/sanityConfig'
import {bindActionByResource} from '../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {observeAddonDatasetClient} from './addonDatasetStore'
import {
  commentsStore,
  getCommentsOptionsKey,
  getCommentsState,
  getCommentThreadsState,
  parseCommentsOptionsKey,
  resolveComments,
} from './commentsStore'
import {setPendingTransaction} from './reducers'
import {type StoredComment} from './types'

vi.mock('./addonDatasetStore', () => ({
  observeAddonDatasetClient: vi.fn(),
}))

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
let client$: BehaviorSubject<SanityClient | null>
let client: SanityClient

/**
 * Keyed on query *and* params: the document id travels as a parameter, so two
 * documents share one query string but must not share a listener.
 */
function listenerFor(query: string, params: Record<string, unknown>) {
  const key = `${query}|${JSON.stringify(params)}`
  const existing = listeners.get(key)
  if (existing) return existing
  const subject = new Subject<ListenEvent<StoredComment>>()
  listeners.set(key, subject)
  return subject
}

beforeEach(() => {
  vi.resetAllMocks()
  listeners = new Map()
  fetches = []

  client = {
    observable: {
      listen: vi.fn((query: string, params: Record<string, unknown>) => listenerFor(query, params)),
      fetch: vi.fn(() => {
        const fetch$ = new Subject<StoredComment[]>()
        fetches.push(fetch$)
        return fetch$
      }),
    },
  } as unknown as SanityClient

  client$ = new BehaviorSubject<SanityClient | null>(client)
  vi.mocked(observeAddonDatasetClient).mockReturnValue(client$)

  instance = createSanityInstance({projectId: 'p', dataset: 'd'})
})

afterEach(() => {
  instance.dispose()
})

describe('getCommentsOptionsKey', () => {
  it('round-trips the options it is given', () => {
    const options = {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
      fieldPath: 'title',
      status: 'resolved' as const,
    }

    expect(parseCommentsOptionsKey(getCommentsOptionsKey(options))).toEqual(options)
  })

  it('gives a path array and its string form the same key', () => {
    expect(
      getCommentsOptionsKey({...HANDLE, fieldPath: ['body', {_key: 'intro'}, 'content']}),
    ).toBe(getCommentsOptionsKey({...HANDLE, fieldPath: 'body[_key=="intro"].content'}))
  })

  it('separates lists that differ only by filter', () => {
    const keys = new Set([
      getCommentsOptionsKey(HANDLE),
      getCommentsOptionsKey({...HANDLE, fieldPath: ''}),
      getCommentsOptionsKey({...HANDLE, fieldPath: 'title'}),
      getCommentsOptionsKey({...HANDLE, status: 'open'}),
      getCommentsOptionsKey({...HANDLE, documentId: 'doc-2'}),
    ])

    expect(keys.size).toBe(5)
  })
})

describe('getCommentsState', () => {
  it('is undefined until the first snapshot arrives', () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    expect(source.getCurrent()).toBe(undefined)
  })

  it('loads a document’s comments once someone reads them', () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([comment({_id: 'a'})])

    // Asserted in full rather than by id. This is the entire mapping from the
    // stored document to what a consumer sees, and it is what has to stay put
    // when comments move off the addon dataset.
    expect(source.getCurrent()).toEqual([
      {
        id: 'a',
        createdAt: '2026-01-01T00:00:00Z',
        authorId: 'user-1',
        message: null,
        threadId: 'thread-1',
        status: 'open',
        documentId: 'doc-1',
        documentType: 'author',
        fieldPath: '',
        reactions: [],
      },
    ])
  })

  it('sorts newest first', () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    const older = comment({_id: 'a', _createdAt: '2026-01-01T00:00:00Z'})
    const newer = comment({_id: 'b', _createdAt: '2026-02-01T00:00:00Z'})

    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([older, newer])

    expect(source.getCurrent()!.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('settles on an empty list when the project has no comments dataset', () => {
    // Leaving this unset would suspend readers forever on a project nobody has
    // ever commented in.
    client$.next(null)

    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    expect(source.getCurrent()).toEqual([])
  })

  it('filters by field path', () => {
    const source = getCommentsState(instance, {...HANDLE, fieldPath: 'title'})
    source.subscribe()

    const onField = comment({
      _id: 'a',
      target: {
        documentType: 'author',
        path: {field: 'title'},
        document: {_ref: 'doc-1', _type: 'reference', _weak: true},
      },
    })

    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([onField, comment({_id: 'b'})])

    expect(source.getCurrent()!.map((c) => c.id)).toEqual(['a'])
  })

  it('matches the field path exactly rather than by prefix', () => {
    // Nothing writes an empty path any more, but the filter is still an exact
    // match, so it must not sweep up every comment on the document.
    const source = getCommentsState(instance, {...HANDLE, fieldPath: ''})
    source.subscribe()

    const onField = comment({
      _id: 'a',
      target: {
        documentType: 'author',
        path: {field: 'title'},
        document: {_ref: 'doc-1', _type: 'reference', _weak: true},
      },
    })

    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([onField, comment({_id: 'b'})])

    expect(source.getCurrent()!.map((c) => c.id)).toEqual(['b'])
  })

  it('filters by status', () => {
    const source = getCommentsState(instance, {...HANDLE, status: 'resolved'})
    source.subscribe()

    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([comment({_id: 'a'}), comment({_id: 'b', status: 'resolved'})])

    expect(source.getCurrent()!.map((c) => c.id)).toEqual(['b'])
  })

  it('keeps a release’s comments apart from the default ones', () => {
    const base = getCommentsState(instance, HANDLE)
    const release = getCommentsState(instance, {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
    })
    base.subscribe()
    release.subscribe()

    expect(listeners.size).toBe(2)

    const [baseListener, releaseListener] = Array.from(listeners.values())
    baseListener.next(WELCOME)
    releaseListener.next(WELCOME)
    fetches[0].next([comment({_id: 'a'})])
    fetches[1].next([comment({_id: 'b'})])

    expect(base.getCurrent()!.map((c) => c.id)).toEqual(['a'])
    expect(release.getCurrent()!.map((c) => c.id)).toEqual(['b'])
  })

  it('shares one list between a draft and its published document', () => {
    getCommentsState(instance, HANDLE).subscribe()
    getCommentsState(instance, {...HANDLE, documentId: 'drafts.doc-1'}).subscribe()

    expect(listeners.size).toBe(1)
  })
})

describe('transaction reconciliation', () => {
  function updateEvent(transactionId: string, status: StoredComment['status']) {
    return {
      type: 'mutation',
      transition: 'update',
      documentId: 'a',
      result: comment({_id: 'a', status}),
      transactionId,
    } as ListenEvent<StoredComment>
  }

  function loaded() {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()
    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([comment({_id: 'a'})])
    return source
  }

  it('ignores an echo from a superseded transaction', () => {
    const source = loaded()
    markPending(instance, {commentId: 'a', transactionId: 'tx-2'})

    listeners.values().next().value!.next(updateEvent('tx-1', 'resolved'))

    expect(source.getCurrent()![0].status).toBe('open')
  })

  it('applies the echo we were waiting for', () => {
    const source = loaded()
    markPending(instance, {commentId: 'a', transactionId: 'tx-2'})

    listeners.values().next().value!.next(updateEvent('tx-2', 'resolved'))

    expect(source.getCurrent()![0].status).toBe('resolved')
  })

  it('applies updates from other clients when nothing is pending', () => {
    const source = loaded()

    listeners.values().next().value!.next(updateEvent('tx-elsewhere', 'resolved'))

    expect(source.getCurrent()![0].status).toBe('resolved')
  })
})

describe('getCommentThreadsState', () => {
  it('groups comments into threads', () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()

    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([comment({_id: 'a'}), comment({_id: 'b', parentCommentId: 'a'})])

    expect(source.getCurrent()).toMatchObject([{threadId: 'thread-1', commentsCount: 2}])
  })

  it('filters by the parent status without dropping replies', () => {
    const source = getCommentThreadsState(instance, {...HANDLE, status: 'resolved'})
    source.subscribe()

    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([
      comment({_id: 'parent', status: 'resolved'}),
      comment({_id: 'reply', parentCommentId: 'parent', status: 'open'}),
    ])

    expect(source.getCurrent()).toMatchObject([
      {
        parentComment: {id: 'parent'},
        replies: [{id: 'reply'}],
        commentsCount: 2,
      },
    ])
  })

  it('returns the same array on repeated reads', () => {
    // A fresh array from one read to the next would make useSyncExternalStore
    // re-render without end.
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()

    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([comment({_id: 'a'})])

    expect(source.getCurrent()).toBe(source.getCurrent())
  })

  it('returns the same array when an unrelated document loads', () => {
    // Every state change re-runs the selector, so without a cache keyed on the
    // data, one document loading would re-render readers of every other one.
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()

    const [ownListener] = Array.from(listeners.values())
    ownListener.next(WELCOME)
    fetches[0].next([comment({_id: 'a'})])
    const before = source.getCurrent()

    const other = getCommentThreadsState(instance, {...HANDLE, documentId: 'doc-2'})
    other.subscribe()
    Array.from(listeners.values())[1].next(WELCOME)
    fetches[1].next([comment({_id: 'b'})])

    expect(source.getCurrent()).toBe(before)
  })
})

describe('resolveComments', () => {
  it('starts loading and resolves with the snapshot', async () => {
    const promise = resolveComments(instance, HANDLE)

    await vi.waitFor(() => expect(listeners.size).toBe(1))
    listeners.values().next().value!.next(WELCOME)
    fetches[0].next([comment({_id: 'a'})])

    await expect(promise).resolves.toMatchObject([{id: 'a'}])
  })

  it('rejects when aborted', async () => {
    const controller = new AbortController()
    const promise = resolveComments(instance, {...HANDLE, signal: controller.signal})

    controller.abort()

    await expect(promise).rejects.toThrow(/aborted/)
  })

  it('tears the listener down when an abort leaves no readers', async () => {
    const controller = new AbortController()
    const promise = resolveComments(instance, {...HANDLE, signal: controller.signal})
    await vi.waitFor(() => expect(listeners.size).toBe(1))

    controller.abort()
    await expect(promise).rejects.toThrow()

    expect(listeners.values().next().value!.observed).toBe(false)
  })
})

describe('listener recovery', () => {
  it('starts listening again when the addon client changes after a listener error', () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    const failedListener = listeners.values().next().value!
    failedListener.error(new Error('connection failed'))
    listeners.clear()

    client$.next(client)

    expect(listeners.size).toBe(1)
  })
})
