import {type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {NEVER, of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getCurrentUserState} from '../auth/authStore'
import {type DocumentResource, type PerspectiveHandle} from '../config/sanityConfig'
import {bindActionByResource} from '../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {commentTarget, storedComment, TARGET_REF} from './__fixtures__/comments'
import {
  addReaction,
  createComment,
  removeComment,
  removeReaction,
  replyToComment,
  setCommentStatus,
  updateComment,
  updateCommentAnchor,
} from './commentActions'
import {observeCommentsClientForResource} from './commentsClient'
import {buildCommentsQueryFilter} from './commentsConstants'
import {type CommentsReadScope} from './commentsOptions'
import {
  commentsStore,
  getCommentsQueryState,
  getCommentThreadsState,
  toDocumentCommentsKey,
} from './commentsStore'
import {addSubscriber, getCommentsKey, setComments} from './reducers'
import {type StoredComment} from './types'

vi.mock('../auth/authStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/authStore')>()),
  getCurrentUserState: vi.fn(),
}))
vi.mock('./commentsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./commentsClient')>()),
  // Reads are not what these tests are about, and a listener would need a whole
  // observable client of its own. Writes take the first value, so the write
  // client is a separate mock below.
  observeCommentsClientForResource: vi.fn(() => NEVER),
}))

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

/** A field-level create; the document-level tests leave `fieldPath` out. */
const CREATE = {...HANDLE, fieldPath: 'name'}

const MESSAGE = [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'hi'}]}]

const ANCHOR = {
  type: 'portable-text',
  start: {_key: 'b1', offset: 0},
  end: {_key: 'b1', offset: 5},
} as const

/** The blocks an anchor can be resolved against instead of the stored document. */
const FIELD_VALUE = [
  {_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'unsaved text'}]},
]

const comment = storedComment

/** Puts comments into the store without going through the listener. */
const seedComments = bindActionByResource(
  commentsStore,
  (
    {state, instance: sanityInstance, key},
    options: {
      resource?: DocumentResource
      documentId?: string
      /** Which list to seed. Defaults to the one a plain read addresses. */
      scope?: CommentsReadScope
      perspective?: PerspectiveHandle['perspective']
      comments: StoredComment[]
    },
  ) => {
    const commentsKey = toDocumentCommentsKey(sanityInstance, {
      ...HANDLE,
      documentId: options.documentId ?? HANDLE.documentId,
      ...(options.scope ? {scope: options.scope} : {}),
      ...(options.perspective ? {perspective: options.perspective} : {}),
      resource: key.resource,
    })
    state.set('addSubscriber', addSubscriber(commentsKey, 'seed'))
    state.set('setComments', setComments(commentsKey, options.comments))
  },
)

/** The same, for a list addressed by a GROQ filter rather than by document. */
const seedQuery = bindActionByResource(
  commentsStore,
  (
    {state},
    options: {
      resource?: DocumentResource
      filter: string
      params?: Record<string, unknown>
      comments: StoredComment[]
    },
  ) => {
    const commentsKey = getCommentsKey({
      filter: buildCommentsQueryFilter(options.filter),
      params: options.params ?? {},
    })
    state.set('addSubscriber', addSubscriber(commentsKey, 'seed'))
    state.set('setComments', setComments(commentsKey, options.comments))
  },
)

const getCommentsStoreState = bindActionByResource(
  commentsStore,
  ({state}, _options: {resource?: DocumentResource}) => state.get(),
)

let instance: SanityInstance
let comments: {
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  addReaction: ReturnType<typeof vi.fn>
  removeReaction: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.mocked(observeCommentsClientForResource).mockReset()

  comments = {
    // The API writes the comment against the document the body named, so what
    // comes back is what says which lists it belongs in. A reply names no
    // target: the API takes its parent's.
    create: vi.fn(async (body: {_id: string; target?: {documentId: string}}) =>
      comment({
        _id: body._id,
        ...(body.target ? {target: commentTarget({sourceDocumentId: body.target.documentId})} : {}),
      }),
    ),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    addReaction: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
  }

  // Reads are not what these tests are about, but seeding an entry opens a
  // listener all the same, so the same client answers both and listens forever.
  vi.mocked(observeCommentsClientForResource).mockReturnValue(
    of({
      collaboration: {comments},
      observable: {collaboration: {comments: {listen: () => NEVER}}},
    } as unknown as SanityClient),
  )

  vi.mocked(getCurrentUserState).mockReturnValue({
    observable: of({id: 'user-1'}),
    getCurrent: () => ({id: 'user-1'}) as CurrentUser,
    subscribe: () => () => {},
  } as unknown as StateSource<CurrentUser | null>)

  instance = createSanityInstance({projectId: 'p', dataset: 'd'})
})

afterEach(() => {
  instance.dispose()
})

describe('createComment', () => {
  it('writes the body the comment API expects', async () => {
    // Asserted whole. This object is the contract with the comment API, and a
    // field quietly dropped from it fails nothing else in the SDK.
    await createComment(instance, {
      ...HANDLE,
      commentId: 'comment-1',
      threadId: 'thread-1',
      message: MESSAGE,
      fieldPath: ['body', {_key: 'intro'}, 'content'],
      documentRevisionId: 'rev-7',
      context: {tool: 'kitchensink'},
    })

    expect(comments.create).toHaveBeenCalledWith(
      {
        _id: 'comment-1',
        message: MESSAGE,
        threadId: 'thread-1',
        context: {tool: 'kitchensink'},
        target: {
          documentId: 'doc-1',
          documentType: 'author',
          documentRevisionId: 'rev-7',
          path: 'body[_key=="intro"].content',
        },
      },
      {tag: 'comments.create'},
    )
  })

  it('sends the id it was given, draft or otherwise', async () => {
    // The API derives the published document the comment hangs off; what it
    // needs from us is which form of it was being looked at.
    await createComment(instance, {...CREATE, documentId: 'drafts.doc-1', message: MESSAGE})

    expect(comments.create.mock.calls[0][0].target.documentId).toBe('drafts.doc-1')
  })

  it('records the release when commenting on one', async () => {
    await createComment(instance, {
      ...CREATE,
      perspective: {releaseName: 'summer'},
      message: MESSAGE,
    })

    expect(comments.create.mock.calls[0][0].target.documentId).toBe('versions.summer.doc-1')
  })

  it('sends an anchor alongside the field it anchors within', async () => {
    await createComment(instance, {...CREATE, message: MESSAGE, fieldPath: 'body', anchor: ANCHOR})

    expect(comments.create.mock.calls[0][0].target).toMatchObject({
      path: 'body',
      anchor: ANCHOR,
    })
  })

  it('sends the blocks an anchor is to be resolved against', async () => {
    // What an editor holding unsaved changes has to pass: the offsets count
    // into text the server has not seen, so resolving them against the stored
    // document would land the comment on the wrong words.
    await createComment(instance, {
      ...CREATE,
      message: MESSAGE,
      fieldPath: 'body',
      anchor: {...ANCHOR, fieldValue: FIELD_VALUE},
    })

    expect(comments.create.mock.calls[0][0].target).toMatchObject({
      path: 'body',
      anchor: {...ANCHOR, fieldValue: FIELD_VALUE},
    })
  })

  it('leaves out what it was not given', async () => {
    await createComment(instance, {...CREATE, message: MESSAGE})

    const body = comments.create.mock.calls[0][0]
    expect('context' in body).toBe(false)
    expect('anchor' in body.target).toBe(false)
    expect('documentRevisionId' in body.target).toBe(false)
  })

  it('shows the comment before the server confirms it', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: []})

    let resolveCreate: (value: StoredComment) => void = () => {}
    comments.create.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))

    const pending = createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE})

    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['c1'])

    resolveCreate(comment({_id: 'c1'}))
    await pending
  })

  it('returns the comment the server stored', async () => {
    comments.create.mockResolvedValue(comment({_id: 'c1', status: 'resolved'}))

    const created = await createComment(instance, {...CREATE, message: MESSAGE})

    expect(created).toMatchObject({id: 'c1', status: 'resolved', authorId: 'user-1'})
  })

  it('reads its own context back, before and after the server confirms it', async () => {
    const context = {tool: 'kitchensink'}
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: []})
    comments.create.mockResolvedValue(comment({_id: 'c1', context}))

    const pending = createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE, context})

    expect(source.getCurrent()![0].parentComment.context).toEqual(context)
    expect((await pending).context).toEqual(context)
  })

  it('leaves a failed comment in place carrying the error', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: []})
    comments.create.mockRejectedValue(new Error('nope'))

    await expect(
      createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE}),
    ).rejects.toThrow('nope')

    expect(source.getCurrent()![0].parentComment.state).toEqual({
      type: 'createError',
      error: expect.any(Error),
    })
  })

  it('marks a failed comment as retrying while the retry is in flight', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: []})
    comments.create.mockRejectedValueOnce(new Error('nope'))

    await expect(
      createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE}),
    ).rejects.toThrow('nope')

    let resolveRetry: (value: StoredComment) => void = () => {}
    comments.create.mockReturnValue(new Promise((resolve) => (resolveRetry = resolve)))

    const retry = createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE})

    expect(source.getCurrent()![0].parentComment.state).toEqual({type: 'createRetrying'})

    resolveRetry(comment({_id: 'c1'}))
    await retry
  })

  it('refuses to write without a logged in user', async () => {
    vi.mocked(getCurrentUserState).mockReturnValue({
      getCurrent: () => null,
      observable: of(null),
      subscribe: () => () => {},
    } as unknown as StateSource<CurrentUser | null>)

    await expect(createComment(instance, {...CREATE, message: MESSAGE})).rejects.toThrow(
      /requires a logged in user/,
    )
  })

  it('writes a comment on the whole document without a path', async () => {
    await createComment(instance, {...HANDLE, message: MESSAGE})
    await createComment(instance, {...HANDLE, fieldPath: '', message: MESSAGE})
    await createComment(instance, {...HANDLE, fieldPath: [], message: MESSAGE})

    for (const [body] of comments.create.mock.calls) {
      expect(body.target).toEqual({documentId: 'doc-1', documentType: 'author'})
    }
  })

  it('shows a comment on the whole document with an empty field path', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: []})
    comments.create.mockReturnValue(new Promise(() => {}))

    void createComment(instance, {...HANDLE, commentId: 'c1', message: MESSAGE})

    expect(source.getCurrent()).toMatchObject([{fieldPath: '', parentComment: {id: 'c1'}}])
  })

  it('refuses an anchor without a field to anchor it in', async () => {
    await expect(
      createComment(instance, {...HANDLE, message: MESSAGE, anchor: ANCHOR}),
    ).rejects.toThrow(/needs a field path/)

    expect(comments.create).not.toHaveBeenCalled()
  })

  it('rolls the comment back when the organization cannot be resolved', async () => {
    // The optimistic comment is applied before the client is asked for, so a
    // failure to resolve the organization has to roll back like any other.
    vi.mocked(observeCommentsClientForResource).mockReturnValue(
      throwError(() => new Error('no organization')),
    )

    await expect(createComment(instance, {...CREATE, message: MESSAGE})).rejects.toThrow(
      /no organization/,
    )

    const {pendingCreates} = getCommentsStoreState(instance, {})
    expect(pendingCreates).toEqual({})
  })
})

describe('the lists a new comment shows up in', () => {
  /** A reader watching one scope, with an empty list to start from. */
  function reading(scope?: CommentsReadScope) {
    const source = getCommentThreadsState(instance, {...HANDLE, ...(scope ? {scope} : {})})
    source.subscribe()
    seedComments(instance, {...(scope ? {scope} : {}), comments: []})
    return source
  }

  /** The same, for a reader watching a GROQ query. */
  function readingQuery(filter: string, params?: Record<string, unknown>) {
    const source = getCommentsQueryState(instance, {filter, ...(params ? {params} : {})})
    source.subscribe()
    seedQuery(instance, {filter, params, comments: []})
    return source
  }

  /** Holds the create open so the optimistic state can be read. */
  function pendingCreate() {
    let resolveCreate: (value: StoredComment) => void = () => {}
    comments.create.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))

    const promise = createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE})
    return {promise, settle: () => resolveCreate(comment({_id: 'c1'}))}
  }

  it('shows it to a reader watching every comment on the document', async () => {
    // Which lists a comment belongs in is the readers' choice, not the writer's.
    // Applying the create to the writer's list alone left a reader on a
    // different `scope` waiting for the listener to catch up.
    const all = reading('all')
    const {promise, settle} = pendingCreate()

    expect(all.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['c1'])

    settle()
    await promise
  })

  it('shows it to a reader pinned to the exact id it was written against', async () => {
    const exact = reading('exact')
    const {promise, settle} = pendingCreate()

    expect(exact.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['c1'])

    settle()
    await promise
  })

  it('carries the failure into every list it was shown in', async () => {
    const all = reading('all')
    const exact = reading('exact')
    comments.create.mockRejectedValue(new Error('nope'))

    await expect(
      createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE}),
    ).rejects.toThrow('nope')

    // A retry is offered from whichever list the comment is being read in, so
    // the failure has to be visible in all of them.
    for (const source of [all, exact]) {
      expect(source.getCurrent()![0].parentComment.state).toEqual({
        type: 'createError',
        error: expect.any(Error),
      })
    }
  })

  it('leaves a reader whose first snapshot is still in flight suspended', async () => {
    // Subscribed but unseeded: the listener is open and the snapshot has not
    // landed. Filling that list in with just this comment would resolve whoever
    // is suspended on it with a list of one, only to replace it a moment later.
    const loading = getCommentThreadsState(instance, {...HANDLE, scope: 'all'})
    loading.subscribe()

    const {promise, settle} = pendingCreate()
    expect(loading.getCurrent()).toBeUndefined()

    settle()
    await promise
    expect(loading.getCurrent()).toBeUndefined()

    // The snapshot is what loads it, carrying the comment the same as any other.
    seedComments(instance, {scope: 'all', comments: [comment({_id: 'c1'})]})
    expect(loading.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['c1'])
  })

  it('keeps a comment written on a release out of the pooled draft list', async () => {
    const pooled = reading()

    await createComment(instance, {
      ...CREATE,
      perspective: {releaseName: 'summer'},
      commentId: 'c1',
      message: MESSAGE,
    })

    // The pooled list is draft and published only. A release's comments showing
    // there would misreport what is being discussed on the document itself.
    expect(pooled.getCurrent()).toEqual([])
  })

  it('shows it to a reader looking at the release it was written on', async () => {
    const perspective = {releaseName: 'summer'}
    const release = getCommentThreadsState(instance, {...HANDLE, perspective})
    release.subscribe()
    seedComments(instance, {perspective, comments: []})

    await createComment(instance, {...CREATE, perspective, commentId: 'c1', message: MESSAGE})

    expect(release.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['c1'])
  })

  it('shows it to a query the comment answers', async () => {
    const query = readingQuery('target.document._ref in $refs', {
      refs: ['dataset:p.d:other', TARGET_REF],
    })
    const {promise, settle} = pendingCreate()

    // A query is a filter like any other, so it does not have to wait for the
    // listener to say that a comment matching it has been written.
    expect(query.getCurrent()!.map((found) => found.id)).toEqual(['c1'])

    settle()
    await promise
    expect(query.getCurrent()!.map((found) => found.id)).toEqual(['c1'])
  })

  it('leaves a query the comment does not answer alone', async () => {
    const query = readingQuery('status == "resolved"')
    const {promise, settle} = pendingCreate()

    expect(query.getCurrent()).toEqual([])

    settle()
    await promise
    expect(query.getCurrent()).toEqual([])
  })

  it('carries a failed create into a query, to be retried from there', async () => {
    const query = readingQuery('status == "open"')
    comments.create.mockRejectedValue(new Error('nope'))

    await expect(
      createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE}),
    ).rejects.toThrow('nope')

    expect(query.getCurrent()![0].state).toEqual({type: 'createError', error: expect.any(Error)})

    // Retrying with the same id replaces it rather than writing a second one.
    comments.create.mockImplementation(async () => comment({_id: 'c1'}))
    await createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE})

    expect(query.getCurrent()!.map((found) => found.id)).toEqual(['c1'])
    expect(query.getCurrent()![0].state).toBeUndefined()
  })

  it('clears a failed copy from a list only the failed attempt reached', async () => {
    // The retry carries different context, so it answers a different query
    // than the attempt that failed, and never touches the first one itself.
    const first = readingQuery('context.tool == "a"')
    const second = readingQuery('context.tool == "b"')
    comments.create.mockRejectedValueOnce(new Error('nope'))

    await expect(
      createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE, context: {tool: 'a'}}),
    ).rejects.toThrow('nope')
    expect(first.getCurrent()![0].state).toEqual({type: 'createError', error: expect.any(Error)})

    comments.create.mockImplementation(async () => comment({_id: 'c1', context: {tool: 'b'}}))
    await createComment(instance, {
      ...CREATE,
      commentId: 'c1',
      message: MESSAGE,
      context: {tool: 'b'},
    })

    expect(first.getCurrent()).toEqual([])
    expect(second.getCurrent()!.map((found) => found.id)).toEqual(['c1'])
  })

  it('takes it back out of a list the comment the server wrote does not belong in', async () => {
    // The API owns part of the comment, so the one that comes back can answer a
    // filter differently from the one shown while the write was in flight.
    const query = readingQuery('status == "open"')
    comments.create.mockImplementation(async () =>
      comment({_id: 'c1', status: 'resolved' as const}),
    )

    await createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE})

    expect(query.getCurrent()).toEqual([])
  })

  it('leaves a query it cannot match locally to the listener', async () => {
    // A dereference cannot be answered against the comment on its own, so this
    // list stays where every list stood before: following the server.
    const query = readingQuery('target.document->._id == "doc-1"')
    const {promise, settle} = pendingCreate()

    expect(query.getCurrent()).toEqual([])

    settle()
    await promise
    expect(query.getCurrent()).toEqual([])
  })
})

describe('replyToComment', () => {
  it('sends only the parent and the message', async () => {
    // Thread, field, and status are the parent's, and the API copies them
    // across, so repeating them here would just be a second source of truth.
    seedComments(instance, {comments: [comment({_id: 'parent'})]})

    await replyToComment(instance, {
      parentCommentId: 'parent',
      commentId: 'reply-1',
      message: MESSAGE,
    })

    expect(comments.create).toHaveBeenCalledWith(
      {_id: 'reply-1', message: MESSAGE, parentCommentId: 'parent'},
      {tag: 'comments.create'},
    )
  })

  it('attaches a reply to a reply to the thread parent', async () => {
    // Threads are one level deep, so a nested reply would be orphaned.
    seedComments(instance, {
      comments: [comment({_id: 'parent'}), comment({_id: 'reply-1', parentCommentId: 'parent'})],
    })

    await replyToComment(instance, {parentCommentId: 'reply-1', message: MESSAGE})

    expect(comments.create.mock.calls[0][0].parentCommentId).toBe('parent')
  })

  it('refuses to reply to a parent that is not loaded', async () => {
    // Everything placing the optimistic reply comes from the parent, so without
    // one it would land in no thread a reader can see — and a failed reply would
    // carry its error there too, with nothing able to offer a retry.
    await expect(
      replyToComment(instance, {parentCommentId: 'unknown', message: MESSAGE}),
    ).rejects.toThrow('Cannot reply to comment unknown: it is not loaded.')

    expect(comments.create).not.toHaveBeenCalled()
  })

  it('replies to a thread on the whole document', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [comment({_id: 'parent', target: commentTarget({path: undefined})})],
    })
    let resolveCreate: (value: StoredComment) => void = () => {}
    comments.create.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))

    const pending = replyToComment(instance, {
      parentCommentId: 'parent',
      commentId: 'r1',
      message: MESSAGE,
    })

    expect(source.getCurrent()).toMatchObject([
      {fieldPath: '', parentComment: {id: 'parent'}, replies: [{id: 'r1'}]},
    ])

    resolveCreate(
      comment({_id: 'r1', parentCommentId: 'parent', target: commentTarget({path: undefined})}),
    )
    await pending
    expect(comments.create).toHaveBeenCalledWith(
      {_id: 'r1', message: MESSAGE, parentCommentId: 'parent'},
      {tag: 'comments.create'},
    )
  })

  it('shows the reply in its parent’s thread before the server confirms it', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: [comment({_id: 'parent', threadId: 'thread-9'})]})

    let resolveCreate: (value: StoredComment) => void = () => {}
    comments.create.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))

    const pending = replyToComment(instance, {
      parentCommentId: 'parent',
      commentId: 'reply-1',
      message: MESSAGE,
    })

    expect(source.getCurrent()).toMatchObject([
      {threadId: 'thread-9', parentComment: {id: 'parent'}, replies: [{id: 'reply-1'}]},
    ])

    resolveCreate(comment({_id: 'reply-1', parentCommentId: 'parent'}))
    await pending
  })
})

describe('updateComment', () => {
  it('patches the message and stamps lastEditedAt', async () => {
    await updateComment(instance, {commentId: 'c1', message: MESSAGE})

    expect(comments.update).toHaveBeenCalledWith(
      'c1',
      {message: MESSAGE},
      {transactionId: expect.any(String), tag: 'comments.update'},
    )
  })

  it('shows the edit and its timestamp right away', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: [comment({_id: 'c1'})]})

    await updateComment(instance, {commentId: 'c1', message: MESSAGE})

    // `lastEditedAt` is local: the API does not return the updated comment, and
    // an edited marker that waits for the listener looks like a lost edit.
    expect(source.getCurrent()![0].parentComment.lastEditedAt).toEqual(expect.any(String))
  })

  it('does not retain a pending transaction when no comment is loaded', async () => {
    await updateComment(instance, {commentId: 'c1', message: MESSAGE})

    expect(getCommentsStoreState(instance, {}).pendingTransactions).toEqual({})
  })

  it('restores the previous message when the write fails', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    const original = [{_type: 'block', children: [{_type: 'span', text: 'hello'}]}]
    seedComments(instance, {comments: [comment({_id: 'c1'})]})
    comments.update.mockRejectedValue(new Error('nope'))

    await expect(updateComment(instance, {commentId: 'c1', message: MESSAGE})).rejects.toThrow(
      'nope',
    )

    expect(source.getCurrent()![0].parentComment.message).toEqual(original)
  })
})

describe('overlapping writes to one comment', () => {
  function deferred() {
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const promise = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    return {promise, resolve, reject}
  }

  const FIRST = [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'first'}]}]
  const SECOND = [{_type: 'block', _key: 'b2', children: [{_type: 'span', text: 'second'}]}]

  it('lets the later write roll itself back after the earlier one succeeds', async () => {
    // The later write's transaction marker is what its rollback keys off. An
    // earlier write settling used to clear whichever marker was there, which
    // left the later one unable to undo itself and its edit stuck on screen.
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: [comment({_id: 'c1'})]})

    const first = deferred()
    const second = deferred()
    comments.update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const firstWrite = updateComment(instance, {commentId: 'c1', message: FIRST})
    const secondWrite = updateComment(instance, {commentId: 'c1', message: SECOND})
    const secondFailed = expect(secondWrite).rejects.toThrow('nope')

    first.resolve()
    await firstWrite

    second.reject(new Error('nope'))
    await secondFailed

    // Back to what the second write found, which is the first write's message.
    expect(source.getCurrent()![0].parentComment.message).toEqual(FIRST)
  })
})

describe('updateCommentAnchor', () => {
  it('patches the anchor', async () => {
    await updateCommentAnchor(instance, {commentId: 'c1', anchor: ANCHOR})

    expect(comments.update).toHaveBeenCalledWith(
      'c1',
      {anchor: ANCHOR},
      {transactionId: expect.any(String), tag: 'comments.update-anchor'},
    )
  })

  it('patches the blocks a new anchor is to be resolved against', async () => {
    await updateCommentAnchor(instance, {
      commentId: 'c1',
      anchor: {...ANCHOR, fieldValue: FIELD_VALUE},
    })

    expect(comments.update).toHaveBeenCalledWith(
      'c1',
      {anchor: {...ANCHOR, fieldValue: FIELD_VALUE}},
      {transactionId: expect.any(String), tag: 'comments.update-anchor'},
    )
  })

  it('writes nothing when it is not given an anchor', async () => {
    // Legal, since the API's update body treats an absent anchor as "leave it
    // alone", but for this action that is a request with nothing in it.
    await updateCommentAnchor(instance, {commentId: 'c1'})

    expect(comments.update).not.toHaveBeenCalled()
  })

  it('leaves lastEditedAt alone', async () => {
    // Re-anchoring is the content moving under the comment, not somebody
    // rewriting it, so it must not read as an edit.
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: [comment({_id: 'c1'})]})

    await updateCommentAnchor(instance, {commentId: 'c1', anchor: ANCHOR})

    expect(source.getCurrent()![0].parentComment.lastEditedAt).toBe(undefined)
  })

  it('drops the selection right away when the anchor is removed', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [
        comment({
          _id: 'c1',
          target: commentTarget({
            path: {field: 'body', selection: {type: 'text', value: [{_key: 'b1', text: 'marked'}]}},
          }),
        }),
      ],
    })

    await updateCommentAnchor(instance, {commentId: 'c1', anchor: null})

    // Knowable locally, unlike a new selection, which the API resolves against
    // the document.
    expect(source.getCurrent()![0].parentComment.selection).toBe(undefined)
    expect(source.getCurrent()![0].fieldPath).toBe('body')
  })

  it('restores the previous anchor when the write fails', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    const selection = {type: 'text' as const, value: [{_key: 'b1', text: 'marked'}]}
    seedComments(instance, {
      comments: [comment({_id: 'c1', target: commentTarget({path: {field: 'body', selection}})})],
    })
    comments.update.mockRejectedValue(new Error('nope'))

    await expect(updateCommentAnchor(instance, {commentId: 'c1', anchor: null})).rejects.toThrow(
      'nope',
    )

    expect(source.getCurrent()![0].parentComment.selection).toEqual(selection)
  })
})

describe('setCommentStatus', () => {
  it('patches the thread’s first comment', async () => {
    await setCommentStatus(instance, {commentId: 'c1', status: 'resolved'})

    expect(comments.update).toHaveBeenCalledWith(
      'c1',
      {status: 'resolved'},
      {transactionId: expect.any(String), tag: 'comments.set-status'},
    )
  })

  it('moves known replies immediately rather than waiting for the echo', async () => {
    // The API cascades to replies, but a thread that resolves one comment at a
    // time on screen looks broken.
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [comment({_id: 'c1'}), comment({_id: 'r1', parentCommentId: 'c1'})],
    })

    await setCommentStatus(instance, {commentId: 'c1', status: 'resolved'})

    const thread = source.getCurrent()![0]
    expect([thread.parentComment, ...thread.replies].every((c) => c.status === 'resolved')).toBe(
      true,
    )
  })

  it('restores the parent and replies when the write fails', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [comment({_id: 'c1'}), comment({_id: 'r1', parentCommentId: 'c1'})],
    })
    comments.update.mockRejectedValue(new Error('nope'))

    await expect(setCommentStatus(instance, {commentId: 'c1', status: 'resolved'})).rejects.toThrow(
      'nope',
    )

    const thread = source.getCurrent()![0]
    expect([thread.parentComment, ...thread.replies].every((c) => c.status === 'open')).toBe(true)
  })
})

describe('removeComment', () => {
  it('deletes the comment', async () => {
    await removeComment(instance, {commentId: 'c1'})

    expect(comments.delete).toHaveBeenCalledWith('c1', {tag: 'comments.remove'})
  })

  it('drops the comment and its replies locally right away', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [
        comment({_id: 'c1'}),
        comment({_id: 'r1', parentCommentId: 'c1'}),
        comment({_id: 'other', threadId: 'thread-2'}),
      ],
    })

    await removeComment(instance, {commentId: 'c1'})

    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['other'])
  })

  it('restores the comment and replies when the write fails', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [
        comment({_id: 'c1'}),
        comment({_id: 'r1', parentCommentId: 'c1'}),
        comment({_id: 'other', threadId: 'thread-2'}),
      ],
    })
    comments.delete.mockRejectedValue(new Error('nope'))

    await expect(removeComment(instance, {commentId: 'c1'})).rejects.toThrow('nope')

    const restored = source
      .getCurrent()!
      .flatMap((thread) => [thread.parentComment, ...thread.replies])
      .map((c) => c.id)
      .sort()
    expect(restored).toEqual(['c1', 'other', 'r1'])
  })
})

describe('a snapshot landing while a write is in flight', () => {
  /** A reconnect refetches, so a snapshot can arrive at any point. */
  function snapshot(stored: StoredComment[]) {
    seedComments(instance, {comments: stored})
  }

  function reading() {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    return source
  }

  it('keeps an edit the snapshot is too old to know about', async () => {
    const source = reading()
    snapshot([comment({_id: 'c1', status: 'open'})])

    let settle: () => void = () => {}
    comments.update.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)))
    const write = setCommentStatus(instance, {commentId: 'c1', status: 'resolved'})

    snapshot([comment({_id: 'c1', status: 'open'})])
    expect(source.getCurrent()![0].status).toBe('resolved')

    settle()
    await write
  })

  it('takes the snapshot for a comment nobody is writing to', async () => {
    const source = reading()
    snapshot([comment({_id: 'c1', status: 'open'}), comment({_id: 'c2', threadId: 'thread-2'})])

    let settle: () => void = () => {}
    comments.update.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)))
    const write = setCommentStatus(instance, {commentId: 'c1', status: 'resolved'})

    // Someone else resolved the other thread. Only the comment this client is
    // writing to is held back from the snapshot.
    snapshot([
      comment({_id: 'c1', status: 'open'}),
      comment({_id: 'c2', threadId: 'thread-2', status: 'resolved'}),
    ])

    const byId = Object.fromEntries(
      source.getCurrent()!.map((thread) => [thread.parentComment.id, thread.status]),
    )
    expect(byId).toEqual({c1: 'resolved', c2: 'resolved'})

    settle()
    await write
  })

  it('keeps a deleted comment out of it until the delete settles', async () => {
    const source = reading()
    snapshot([comment({_id: 'c1'}), comment({_id: 'r1', parentCommentId: 'c1'})])

    let settle: () => void = () => {}
    comments.delete.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)))
    const write = removeComment(instance, {commentId: 'c1'})

    // The server still holds them, so a snapshot fetched now carries both.
    snapshot([comment({_id: 'c1'}), comment({_id: 'r1', parentCommentId: 'c1'})])
    expect(source.getCurrent()).toEqual([])

    settle()
    await write
  })

  it('takes a deleted comment back when the delete fails', async () => {
    const source = reading()
    snapshot([comment({_id: 'c1'})])
    comments.delete.mockRejectedValue(new Error('nope'))

    await expect(removeComment(instance, {commentId: 'c1'})).rejects.toThrow('nope')

    // Restored locally, and no longer held out of the snapshots that follow.
    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['c1'])
    snapshot([comment({_id: 'c1'})])
    expect(source.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['c1'])
  })
})

describe('reactions', () => {
  it('adds the current user’s reaction', async () => {
    await addReaction(instance, {commentId: 'c1', shortName: ':+1:'})

    expect(comments.addReaction).toHaveBeenCalledWith('c1', ':+1:', {
      transactionId: expect.any(String),
      tag: 'comments.add-reaction',
    })
  })

  it('removes the current user’s reaction', async () => {
    await removeReaction(instance, {commentId: 'c1', shortName: ':+1:'})

    expect(comments.removeReaction).toHaveBeenCalledWith('c1', ':+1:', {
      transactionId: expect.any(String),
      tag: 'comments.remove-reaction',
    })
  })

  it('shows the reaction before the server confirms it', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: [comment({_id: 'c1'})]})

    let resolve: () => void = () => {}
    comments.addReaction.mockReturnValue(new Promise<void>((r) => (resolve = r)))

    const pending = addReaction(instance, {commentId: 'c1', shortName: ':+1:'})

    expect(source.getCurrent()![0].parentComment.reactions).toEqual([
      {shortName: ':+1:', userId: 'user-1', addedAt: expect.any(String)},
    ])

    resolve()
    await pending
  })

  it('leaves other people’s reactions alone', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [
        comment({
          _id: 'c1',
          reactions: [{_key: 'r1', shortName: ':+1:', userId: 'user-2', addedAt: 'then'}],
        }),
      ],
    })

    await removeReaction(instance, {commentId: 'c1', shortName: ':+1:'})

    expect(source.getCurrent()![0].parentComment.reactions).toEqual([
      {shortName: ':+1:', userId: 'user-2', addedAt: 'then'},
    ])
  })

  it('does not add the same reaction twice', async () => {
    // An app can ask for a reaction the list already shows, and two identical
    // entries would double the count on screen until the listener corrected it.
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [
        comment({
          _id: 'c1',
          reactions: [{_key: 'r1', shortName: ':+1:', userId: 'user-1', addedAt: 'then'}],
        }),
      ],
    })

    await addReaction(instance, {commentId: 'c1', shortName: ':+1:'})

    expect(source.getCurrent()![0].parentComment.reactions).toHaveLength(1)
  })

  it('puts the reaction back when the write fails', async () => {
    const source = getCommentThreadsState(instance, HANDLE)
    source.subscribe()
    const existing = {_key: 'r1', shortName: ':+1:' as const, userId: 'user-1', addedAt: 'then'}
    seedComments(instance, {comments: [comment({_id: 'c1', reactions: [existing]})]})
    comments.removeReaction.mockRejectedValue(new Error('nope'))

    await expect(removeReaction(instance, {commentId: 'c1', shortName: ':+1:'})).rejects.toThrow(
      'nope',
    )

    expect(source.getCurrent()![0].parentComment.reactions).toEqual([
      {shortName: ':+1:', userId: 'user-1', addedAt: 'then'},
    ])
  })

  it('refuses to react without a logged in user', async () => {
    vi.mocked(getCurrentUserState).mockReturnValue({
      getCurrent: () => null,
      observable: of(null),
      subscribe: () => () => {},
    } as unknown as StateSource<CurrentUser | null>)

    await expect(addReaction(instance, {commentId: 'c1', shortName: ':+1:'})).rejects.toThrow(
      /requires a logged in user/,
    )
  })
})

describe('client resolution', () => {
  it('writes through a client for the resource the action is bound to', async () => {
    await createComment(instance, {...CREATE, message: MESSAGE})

    expect(
      vi.mocked(observeCommentsClientForResource).mock.calls.map(([, resource]) => resource),
    ).toContainEqual({projectId: 'p', dataset: 'd'})
  })
})
