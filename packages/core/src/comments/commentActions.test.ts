import {type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {NEVER, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getCurrentUserState} from '../auth/authStore'
import {type DocumentResource, type PerspectiveHandle} from '../config/sanityConfig'
import {bindActionByResource} from '../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  addReaction,
  createComment,
  removeComment,
  removeReaction,
  replyToComment,
  setCommentStatus,
  updateComment,
  updateCommentRange,
} from './commentActions'
import {commentTarget, ORGANIZATION_ID, storedComment} from './commentFixtures'
import {getCommentsClient} from './commentsClient'
import {
  commentsStore,
  type CommentVariants,
  getDocumentCommentsState,
  toDocumentCommentsKey,
} from './commentsStore'
import {addSubscriber, setComments} from './reducers'
import {type StoredComment} from './types'

vi.mock('../auth/authStore', () => ({getCurrentUserState: vi.fn()}))
vi.mock('./commentsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./commentsClient')>()),
  getCommentsClient: vi.fn(),
  // Reads are not what these tests are about, and a listener would need a whole
  // observable client of its own.
  observeCommentsClient: vi.fn(() => NEVER),
}))

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

/** Creates always name a field, since a pathless comment is refused. */
const CREATE = {...HANDLE, fieldPath: 'name'}

const MESSAGE = [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'hi'}]}]

const RANGE = {
  start: {_key: 'b1', offset: 0},
  end: {_key: 'b1', offset: 5},
}

const comment = storedComment

/** Puts comments into the store without going through the listener. */
const seedComments = bindActionByResource(
  commentsStore,
  (
    {state, instance: sanityInstance, key},
    options: {
      resource?: DocumentResource
      documentId?: string
      /** Which variant list to seed. Defaults to the one a plain read addresses. */
      variants?: CommentVariants
      perspective?: PerspectiveHandle['perspective']
      comments: StoredComment[]
    },
  ) => {
    const commentsKey = toDocumentCommentsKey(sanityInstance, {
      ...HANDLE,
      documentId: options.documentId ?? HANDLE.documentId,
      ...(options.variants ? {variants: options.variants} : {}),
      ...(options.perspective ? {perspective: options.perspective} : {}),
      resource: key.resource,
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
  getTargetDocumentRef: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.mocked(getCommentsClient).mockReset()

  comments = {
    create: vi.fn(async (body: {_id: string}) => comment({_id: body._id})),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    addReaction: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
    getTargetDocumentRef: vi.fn(
      (documentId: string) =>
        `dataset:p.d:${documentId.replace(/^drafts\.|^versions\.[^.]+\./, '')}`,
    ),
  }

  vi.mocked(getCommentsClient).mockReturnValue({
    collaboration: {comments},
  } as unknown as SanityClient)

  vi.mocked(getCurrentUserState).mockReturnValue({
    observable: of({id: 'user-1'}),
    getCurrent: () => ({id: 'user-1'}) as CurrentUser,
    subscribe: () => () => {},
  } as unknown as StateSource<CurrentUser | null>)

  instance = createSanityInstance({
    projectId: 'p',
    dataset: 'd',
    collaboration: {organizationId: ORGANIZATION_ID},
  })
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
    // needs from us is which variant was being looked at.
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

  it('sends a range alongside the field it anchors within', async () => {
    await createComment(instance, {...CREATE, message: MESSAGE, fieldPath: 'body', range: RANGE})

    expect(comments.create.mock.calls[0][0].target).toMatchObject({
      path: 'body',
      range: RANGE,
    })
  })

  it('leaves out what it was not given', async () => {
    await createComment(instance, {...CREATE, message: MESSAGE})

    const body = comments.create.mock.calls[0][0]
    expect('context' in body).toBe(false)
    expect('range' in body.target).toBe(false)
    expect('documentRevisionId' in body.target).toBe(false)
  })

  it('shows the comment before the server confirms it', async () => {
    const source = getDocumentCommentsState(instance, HANDLE)
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

  it('leaves a failed comment in place carrying the error', async () => {
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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

  it('refuses a comment that points at no field', async () => {
    // Not pedantry. The Studio's inspector calls `fromString` on the stored
    // path and throws on `''`, so a pathless comment crashes the inspector for
    // everyone viewing that document until someone deletes it.
    await expect(
      createComment(instance, {...HANDLE, fieldPath: '', message: MESSAGE}),
    ).rejects.toThrow(/needs a field path/)

    await expect(
      createComment(instance, {...HANDLE, fieldPath: [], message: MESSAGE}),
    ).rejects.toThrow(/needs a field path/)

    expect(comments.create).not.toHaveBeenCalled()
  })

  it('says what is missing when no organization is configured', async () => {
    const bare = createSanityInstance({projectId: 'p', dataset: 'd'})

    await expect(createComment(bare, {...CREATE, message: MESSAGE})).rejects.toThrow(
      /collaboration: \{organizationId\}/,
    )

    bare.dispose()
  })
})

describe('the lists a new comment shows up in', () => {
  /** A reader watching one set of variants, with an empty list to start from. */
  function reading(variants: CommentVariants) {
    const source = getDocumentCommentsState(instance, {...HANDLE, variants})
    source.subscribe()
    seedComments(instance, {variants, comments: []})
    return source
  }

  /** Holds the create open so the optimistic state can be read. */
  function pendingCreate() {
    let resolveCreate: (value: StoredComment) => void = () => {}
    comments.create.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))

    const promise = createComment(instance, {...CREATE, commentId: 'c1', message: MESSAGE})
    return {promise, settle: () => resolveCreate(comment({_id: 'c1'}))}
  }

  it('shows it to a reader watching every variant', async () => {
    // Which lists a comment belongs in is the readers' choice, not the writer's.
    // Applying the create to the writer's list alone left a reader on a
    // different `variants` waiting for the listener to catch up.
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

  it('keeps a comment written on a release out of the pooled draft list', async () => {
    const drafts = reading('drafts')

    await createComment(instance, {
      ...CREATE,
      perspective: {releaseName: 'summer'},
      commentId: 'c1',
      message: MESSAGE,
    })

    // The pooled list is draft and published only. A release's comments showing
    // there would misreport what is being discussed on the document itself.
    expect(drafts.getCurrent()).toEqual([])
  })

  it('shows it to a reader looking at the release it was written on', async () => {
    const perspective = {releaseName: 'summer'}
    const release = getDocumentCommentsState(instance, {...HANDLE, perspective})
    release.subscribe()
    seedComments(instance, {perspective, comments: []})

    await createComment(instance, {...CREATE, perspective, commentId: 'c1', message: MESSAGE})

    expect(release.getCurrent()!.map((thread) => thread.parentComment.id)).toEqual(['c1'])
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

  it('refuses to reply to a parent that points at no field', async () => {
    // A reply inherits the parent's path, so a pathless one would take down the
    // Studio's inspector exactly as a pathless comment does.
    seedComments(instance, {
      comments: [comment({_id: 'parent', target: commentTarget({path: undefined})})],
    })

    await expect(
      replyToComment(instance, {parentCommentId: 'parent', message: MESSAGE}),
    ).rejects.toThrow(/needs a field path/)

    expect(comments.create).not.toHaveBeenCalled()
  })

  it('shows the reply in its parent’s thread before the server confirms it', async () => {
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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

describe('updateCommentRange', () => {
  it('patches the range', async () => {
    await updateCommentRange(instance, {commentId: 'c1', range: RANGE})

    expect(comments.update).toHaveBeenCalledWith(
      'c1',
      {range: RANGE},
      {transactionId: expect.any(String), tag: 'comments.update-range'},
    )
  })

  it('leaves lastEditedAt alone', async () => {
    // Re-anchoring is the content moving under the comment, not somebody
    // rewriting it, so it must not read as an edit.
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: [comment({_id: 'c1'})]})

    await updateCommentRange(instance, {commentId: 'c1', range: RANGE})

    expect(source.getCurrent()![0].parentComment.lastEditedAt).toBe(undefined)
  })

  it('drops the selection right away when the anchor is removed', async () => {
    const source = getDocumentCommentsState(instance, HANDLE)
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

    await updateCommentRange(instance, {commentId: 'c1', range: null})

    // Knowable locally, unlike a new selection, which the API resolves against
    // the document.
    expect(source.getCurrent()![0].parentComment.selection).toBe(undefined)
    expect(source.getCurrent()![0].fieldPath).toBe('body')
  })

  it('restores the previous anchor when the write fails', async () => {
    const source = getDocumentCommentsState(instance, HANDLE)
    source.subscribe()
    const selection = {type: 'text' as const, value: [{_key: 'b1', text: 'marked'}]}
    seedComments(instance, {
      comments: [comment({_id: 'c1', target: commentTarget({path: {field: 'body', selection}})})],
    })
    comments.update.mockRejectedValue(new Error('nope'))

    await expect(updateCommentRange(instance, {commentId: 'c1', range: null})).rejects.toThrow(
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
    const source = getDocumentCommentsState(instance, HANDLE)
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
  it('builds one client per organization the caller asks for', async () => {
    await createComment(instance, {...CREATE, message: MESSAGE})
    await createComment(instance, {
      ...CREATE,
      message: MESSAGE,
      collaboration: {organizationId: 'org-2'},
    })

    // A per-call organization has to reach the client, or a caller working
    // across organizations would silently write into the configured one.
    expect(
      new Set(vi.mocked(getCommentsClient).mock.calls.map(([, options]) => options.organizationId)),
    ).toEqual(new Set([ORGANIZATION_ID, 'org-2']))
  })
})
