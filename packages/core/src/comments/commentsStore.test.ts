import {type ListenEvent, type SanityClient} from '@sanity/client'
import {BehaviorSubject, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type DocumentResource} from '../config/sanityConfig'
import {bindActionByResource} from '../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {updateComment} from './commentActions'
import {commentTarget, ORGANIZATION_ID, storedComment} from './commentFixtures'
import {observeCommentsClient} from './commentsClient'
import {
  commentsStore,
  getCommentsQueryOptionsKey,
  getCommentsQueryState,
  getDocumentCommentsOptionsKey,
  getDocumentCommentsState,
  parseCommentsQueryOptionsKey,
  parseDocumentCommentsOptionsKey,
  resolveCommentsQuery,
  resolveDocumentComments,
} from './commentsStore'
import {setPendingTransaction} from './reducers'
import {type StoredComment} from './types'

vi.mock('./commentsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./commentsClient')>()),
  getCommentsClient: vi.fn(() => client),
  observeCommentsClient: vi.fn(() => client$),
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
 * Keyed on query *and* params: the target reference travels as a parameter, so
 * two documents share one query string but must not share a listener.
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
    collaboration: {
      comments: {
        ...writes,
        getTargetDocumentRef: (documentId: string) =>
          `dataset:p.d:${documentId.replace(/^drafts\.|^versions\.[^.]+\./, '')}`,
      },
    },
    observable: {collaboration: {comments}},
  } as unknown as SanityClient

  client$ = new BehaviorSubject<SanityClient>(client)
  vi.mocked(observeCommentsClient).mockReset().mockReturnValue(client$)

  instance = createSanityInstance({
    projectId: 'p',
    dataset: 'd',
    collaboration: {organizationId: ORGANIZATION_ID},
  })
})

afterEach(() => {
  instance.dispose()
})

/** Feeds a snapshot into the only listener a test has opened. */
function snapshot(comments: StoredComment[], index = 0) {
  Array.from(listeners.values())[index]!.next(WELCOME)
  fetches[index].next(comments)
}

describe('getDocumentCommentsOptionsKey', () => {
  it('round-trips the options it is given', () => {
    const options = {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
      fieldPath: 'title',
      status: 'resolved' as const,
      variants: 'all' as const,
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
      getDocumentCommentsOptionsKey({...HANDLE, variants: 'all'}),
      getDocumentCommentsOptionsKey({...HANDLE, collaboration: {organizationId: 'org-2'}}),
    ])

    expect(keys.size).toBe(7)
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

describe('getDocumentCommentsState', () => {
  it('is undefined until the first snapshot arrives', () => {
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()

    expect(source.getCurrent()).toBe(undefined)
  })

  it('groups a document’s comments into threads once someone reads them', () => {
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()

    snapshot([storedComment({_id: 'a'}), storedComment({_id: 'b', parentCommentId: 'a'})])

    expect(source.getCurrent()).toMatchObject([
      {threadId: 'thread-1', parentComment: {id: 'a'}, replies: [{id: 'b'}], commentsCount: 2},
    ])
  })

  it('reads the document by its global reference, whichever variant was asked for', () => {
    getDocumentCommentsState(instance, HANDLE).subscribe()

    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledWith(
      expect.stringContaining('target.document._ref == $targetRef'),
      {targetRef: 'dataset:p.d:doc-1'},
      expect.objectContaining({tag: 'comments.listen'}),
    )
  })

  it('sorts newest thread first', () => {
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()

    snapshot([
      storedComment({_id: 'a', _createdAt: '2026-01-01T00:00:00Z', threadId: 'thread-a'}),
      storedComment({_id: 'b', _createdAt: '2026-02-01T00:00:00Z', threadId: 'thread-b'}),
    ])

    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['b', 'a'])
  })

  it('filters by field path', () => {
    const source = getDocumentCommentsState(instance, {...HANDLE, fieldPath: 'title'})
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
    const source = getDocumentCommentsState(instance, {...HANDLE, fieldPath: ''})
    source.subscribe()

    snapshot([
      storedComment({_id: 'a', target: commentTarget({path: {field: 'title'}})}),
      storedComment({_id: 'b', threadId: 'thread-2', target: commentTarget({path: undefined})}),
    ])

    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['b'])
  })

  it('filters by the parent status without dropping replies', () => {
    const source = getDocumentCommentsState(instance, {...HANDLE, status: 'resolved'})
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
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()

    snapshot([storedComment({_id: 'a'})])

    expect(source.getCurrent()).toBe(source.getCurrent())
  })

  it('returns the same array when an unrelated document loads', () => {
    // Every state change re-runs the selector, so without a cache keyed on the
    // data, one document loading would re-render readers of every other one.
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])
    const before = source.getCurrent()

    const other = getDocumentCommentsState(instance, {...HANDLE, documentId: 'doc-2'})
    other.subscribe()
    snapshot([storedComment({_id: 'b'})], 1)

    expect(source.getCurrent()).toBe(before)
  })
})

describe('variants', () => {
  it('pools draft and published by default, excluding releases', () => {
    getDocumentCommentsState(instance, HANDLE).subscribe()

    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledWith(
      expect.stringContaining('!string::startsWith(target.sourceDocumentId, "versions.")'),
      {targetRef: 'dataset:p.d:doc-1'},
      expect.anything(),
    )
  })

  it('shares one list between a draft and its published document', () => {
    getDocumentCommentsState(instance, HANDLE).subscribe()
    getDocumentCommentsState(instance, {...HANDLE, documentId: 'drafts.doc-1'}).subscribe()

    expect(listeners.size).toBe(1)
  })

  it('pins to the release version under a release perspective', () => {
    getDocumentCommentsState(instance, {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
    }).subscribe()

    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledWith(
      expect.stringContaining('target.sourceDocumentId == $sourceDocumentId'),
      {targetRef: 'dataset:p.d:doc-1', sourceDocumentId: 'versions.summer.doc-1'},
      expect.anything(),
    )
  })

  it('keeps a release’s comments apart from the default ones', () => {
    const base = getDocumentCommentsState(instance, HANDLE)
    const release = getDocumentCommentsState(instance, {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
    })
    base.subscribe()
    release.subscribe()

    expect(listeners.size).toBe(2)

    snapshot([storedComment({_id: 'a'})])
    snapshot([storedComment({_id: 'b'})], 1)

    expect(base.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['a'])
    expect(release.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['b'])
  })

  it('pins to the exact id passed when asked for', () => {
    getDocumentCommentsState(instance, {
      ...HANDLE,
      documentId: 'drafts.doc-1',
      variants: 'exact',
    }).subscribe()

    // The draft id, not the published one: `exact` is the variant for "only what
    // was written against precisely this".
    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledWith(
      expect.stringContaining('target.sourceDocumentId == $sourceDocumentId'),
      {targetRef: 'dataset:p.d:doc-1', sourceDocumentId: 'drafts.doc-1'},
      expect.anything(),
    )
  })

  it('ignores the perspective when asked for drafts', () => {
    getDocumentCommentsState(instance, {
      ...HANDLE,
      perspective: {releaseName: 'summer'},
      variants: 'drafts',
    }).subscribe()

    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledWith(
      expect.stringContaining('!string::startsWith(target.sourceDocumentId, "versions.")'),
      {targetRef: 'dataset:p.d:doc-1'},
      expect.anything(),
    )
  })

  it('filters on the document alone when asked for all of them', () => {
    getDocumentCommentsState(instance, {...HANDLE, variants: 'all'}).subscribe()

    const [query, params] = vi.mocked(client.observable.collaboration.comments.listen).mock.calls[0]

    expect(query).not.toContain('sourceDocumentId')
    expect(params).toEqual({targetRef: 'dataset:p.d:doc-1'})
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
    expect(client.observable.collaboration.comments.listen).toHaveBeenCalledWith(
      '*[_type == "sanity.comment" && (authorId == $userId)]',
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

    expect(listeners.size).toBe(1)
  })

  it('keeps two organizations’ lists apart', () => {
    getCommentsQueryState(instance, {filter: 'status == "open"'}).subscribe()
    getCommentsQueryState(instance, {
      filter: 'status == "open"',
      collaboration: {organizationId: 'org-2'},
    }).subscribe()

    // One filter, two entries, each read through its own client. Sharing an
    // entry would show one organization the other's comments.
    expect(
      vi.mocked(observeCommentsClient).mock.calls.map(([, options]) => options.organizationId),
    ).toEqual([ORGANIZATION_ID, 'org-2'])
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
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])
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
    listeners.values().next().value!.next(updateEvent('tx-elsewhere', 'resolved'))
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

  function disappear(index: number, commentId: string) {
    Array.from(listeners.values())[index]!.next({
      type: 'mutation',
      transition: 'disappear',
      documentId: commentId,
    } as ListenEvent<StoredComment>)
  }

  /** The document's threads and an open-only query, both holding one thread. */
  function twoLists() {
    const document = getDocumentCommentsState(instance, HANDLE)
    const query = getCommentsQueryState(instance, {filter: 'status == "open"'})
    document.subscribe()
    query.subscribe()

    snapshot(THREAD)
    snapshot(THREAD, 1)

    return {document, query}
  }

  it('leaves the lists that still match it alone', () => {
    const {document, query} = twoLists()

    // Resolving the thread takes its parent out of an open-only query. The
    // document's own list is unfiltered, so the comment has not gone anywhere as
    // far as that list is concerned.
    disappear(1, 'a')

    expect(query.getCurrent()!.map((comment) => comment.id)).toEqual(['b'])
    expect(document.getCurrent()).toMatchObject([{parentComment: {id: 'a'}, replies: [{id: 'b'}]}])
  })

  it('keeps the replies of the comment that left', () => {
    // The replies were not mutated, so no event of their own is coming. Dropping
    // them here would lose them until the next reconnect.
    const {query} = twoLists()

    disappear(1, 'a')

    expect(query.getCurrent()!.map((comment) => comment.id)).toEqual(['b'])
  })

  it('empties the list when a deleted thread disappears comment by comment', () => {
    const {document} = twoLists()

    disappear(0, 'a')
    disappear(0, 'b')

    expect(document.getCurrent()).toEqual([])
  })
})

describe('resolveDocumentComments', () => {
  it('starts loading and resolves with the threads', async () => {
    const promise = resolveDocumentComments(instance, HANDLE)

    await vi.waitFor(() => expect(listeners.size).toBe(1))
    snapshot([storedComment({_id: 'a'})])

    await expect(promise).resolves.toMatchObject([{parentComment: {id: 'a'}}])
  })

  it('rejects when aborted', async () => {
    const controller = new AbortController()
    const promise = resolveDocumentComments(instance, {...HANDLE, signal: controller.signal})

    controller.abort()

    await expect(promise).rejects.toThrow(/aborted/)
  })

  it('tears the listener down when an abort leaves no readers', async () => {
    const controller = new AbortController()
    const promise = resolveDocumentComments(instance, {...HANDLE, signal: controller.signal})
    await vi.waitFor(() => expect(listeners.size).toBe(1))

    controller.abort()
    await expect(promise).rejects.toThrow()

    expect(listeners.values().next().value!.observed).toBe(false)
  })
})

describe('resolveCommentsQuery', () => {
  it('starts loading and resolves with the comments', async () => {
    const promise = resolveCommentsQuery(instance, {filter: 'status == "open"'})

    await vi.waitFor(() => expect(listeners.size).toBe(1))
    snapshot([storedComment({_id: 'a'})])

    await expect(promise).resolves.toMatchObject([{id: 'a'}])
  })
})

describe('listener recovery', () => {
  it('keeps serving a loaded list after its listener fails', () => {
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()
    snapshot([storedComment({_id: 'a'})])

    listeners.values().next().value!.error(new Error('connection failed'))

    // Stale beats gone. Replacing a list someone is reading with an error
    // boundary loses comments that are still perfectly good to show; they just
    // stop updating until a listener comes back.
    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['a'])
  })

  it('surfaces a failure that arrives before anything has loaded', () => {
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()

    listeners.values().next().value!.error(new Error('connection failed'))

    // Nothing to fall back on here, and a reader left suspended forever would
    // say less than the failure does.
    expect(() => source.getCurrent()).toThrow('connection failed')
  })

  it('starts listening again when the client changes after a listener error', () => {
    getDocumentCommentsState(instance, HANDLE).subscribe()

    const failedListener = listeners.values().next().value!
    failedListener.error(new Error('connection failed'))
    listeners.clear()

    client$.next(client)

    expect(listeners.size).toBe(1)
  })
})
