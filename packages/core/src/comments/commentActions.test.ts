import {type SanityClient} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getCurrentUserState} from '../auth/authStore'
import {getClient} from '../client/clientStore'
import {type DocumentResource} from '../config/sanityConfig'
import {bindActionByResource} from '../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getAddonDatasetState, provisionAddonDataset} from './addonDatasetStore'
import {
  createComment,
  removeComment,
  replyToComment,
  setCommentStatus,
  updateComment,
} from './commentActions'
import {commentsStore, getCommentsState} from './commentsStore'
import {addSubscriber, getCommentsKey, setComments} from './reducers'
import {type StoredComment} from './types'

vi.mock('../auth/authStore', () => ({getCurrentUserState: vi.fn()}))
vi.mock('../client/clientStore', () => ({getClient: vi.fn(), getClientState: vi.fn()}))
vi.mock('./addonDatasetStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./addonDatasetStore')>()),
  getAddonDatasetState: vi.fn(),
  provisionAddonDataset: vi.fn(),
  observeAddonDatasetClient: vi.fn(() => of(null)),
}))

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

/** Creates always name a field, since a pathless comment is refused. */
const CREATE = {...HANDLE, fieldPath: 'name'}

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
    target: {
      documentType: 'author',
      // Every comment points at a field, so replies inherit a real path.
      path: {field: 'name'},
      document: {_ref: 'doc-1', _type: 'reference', _weak: true},
    },
    ...overrides,
  } satisfies StoredComment as StoredComment
}

/** Puts comments into the store without going through the listener. */
const seedComments = bindActionByResource(
  commentsStore,
  (
    {state},
    options: {resource?: DocumentResource; documentId?: string; comments: StoredComment[]},
  ) => {
    const key = getCommentsKey({documentId: options.documentId ?? 'doc-1'})
    state.set('addSubscriber', addSubscriber(key, 'seed'))
    state.set('setComments', setComments(key, options.comments))
  },
)

const getCommentsStoreState = bindActionByResource(
  commentsStore,
  ({state}, _options: {resource?: DocumentResource}) => state.get(),
)

let instance: SanityInstance
let client: {
  create: ReturnType<typeof vi.fn>
  createIfNotExists: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  mutate: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}
let patchCommit: ReturnType<typeof vi.fn>
let transactionCommit: ReturnType<typeof vi.fn>
let patchSet: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()

  patchCommit = vi.fn().mockResolvedValue({})
  transactionCommit = vi.fn().mockResolvedValue({})
  patchSet = vi.fn(() => ({commit: patchCommit, set: patchSet}))

  const patch = vi.fn(() => ({set: patchSet, commit: patchCommit}))
  const transaction = vi.fn(() => {
    const tx = {
      transactionId: vi.fn(() => tx),
      patch: vi.fn(() => tx),
      commit: transactionCommit,
    }
    return tx
  })

  client = {
    create: vi.fn(async (doc) => ({...doc, _createdAt: '2026-06-01T00:00:00Z', _rev: 'rev-1'})),
    createIfNotExists: vi.fn(async (doc) => ({
      ...doc,
      _createdAt: '2026-06-01T00:00:00Z',
      _rev: 'rev-1',
    })),
    patch,
    delete: vi.fn().mockResolvedValue({}),
    mutate: vi.fn().mockResolvedValue({}),
    transaction,
  }

  vi.mocked(getClient).mockReturnValue(client as unknown as SanityClient)
  vi.mocked(provisionAddonDataset).mockResolvedValue('d-comments')
  vi.mocked(getAddonDatasetState).mockReturnValue({
    observable: of('d-comments'),
    getCurrent: () => 'd-comments',
    subscribe: () => () => {},
  } as unknown as StateSource<string | null | undefined>)
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
  it('writes the document shape the Studio reads', async () => {
    // Golden test. This object is the interop contract: the Studio filters on
    // `target.document._ref` and groups on `target.path.field`, so a change
    // here makes SDK comments invisible in the Studio without failing anything
    // else.
    await createComment(instance, {
      ...HANDLE,
      commentId: 'comment-1',
      threadId: 'thread-1',
      message: [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'hi'}]}],
      fieldPath: ['body', {_key: 'intro'}, 'content'],
    })

    expect(client.createIfNotExists).toHaveBeenCalledWith(
      {
        _id: 'comment-1',
        _type: 'comment',
        authorId: 'user-1',
        message: [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'hi'}]}],
        threadId: 'thread-1',
        status: 'open',
        reactions: null,
        context: {tool: ''},
        target: {
          documentRevisionId: '',
          path: {field: 'body[_key=="intro"].content'},
          document: {
            _dataset: 'd',
            _projectId: 'p',
            _ref: 'doc-1',
            _type: 'crossDatasetReference',
            _weak: true,
          },
          documentType: 'author',
        },
      },
      {tag: 'comments.create'},
    )
  })

  it('targets the published document from a draft id', async () => {
    await createComment(instance, {...CREATE, documentId: 'drafts.doc-1', message: null})

    expect(client.createIfNotExists.mock.calls[0][0].target.document._ref).toBe('doc-1')
  })

  it('records the release when commenting on one', async () => {
    await createComment(instance, {
      ...CREATE,
      perspective: {releaseName: 'summer'},
      message: null,
    })

    expect(client.createIfNotExists.mock.calls[0][0].target.documentVersionId).toBe('summer')
  })

  it('carries a text selection through untouched', async () => {
    const selection = {type: 'text' as const, value: [{_key: 'b1', text: 'marked'}]}

    await createComment(instance, {...CREATE, message: null, fieldPath: 'body', selection})

    expect(client.createIfNotExists.mock.calls[0][0].target.path).toEqual({
      field: 'body',
      selection,
    })
  })

  it('weakens references in a content snapshot', async () => {
    await createComment(instance, {
      ...CREATE,
      message: null,
      contentSnapshot: {author: {_ref: 'other-doc', _type: 'reference'}},
    })

    expect(client.createIfNotExists.mock.calls[0][0].contentSnapshot).toEqual({
      author: {_ref: 'other-doc', _type: 'reference', _weak: true},
    })
  })

  it('provisions the addon dataset on the way', async () => {
    await createComment(instance, {...CREATE, message: null})

    expect(provisionAddonDataset).toHaveBeenCalled()
    expect(getClient).toHaveBeenCalledWith(instance, {
      apiVersion: 'v2025-05-06',
      projectId: 'p',
      dataset: 'd-comments',
    })
  })

  it('shows the comment before the server confirms it', async () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    let resolveCreate: (value: unknown) => void = () => {}
    client.createIfNotExists.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))

    const pending = createComment(instance, {...CREATE, commentId: 'c1', message: null})

    expect(source.getCurrent()!.map((c) => c.id)).toEqual(['c1'])

    resolveCreate({...comment({_id: 'c1'})})
    await pending
  })

  it('leaves a failed comment in place carrying the error', async () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()

    client.create.mockRejectedValue(new Error('nope'))
    client.createIfNotExists.mockRejectedValue(new Error('nope'))

    await expect(
      createComment(instance, {...CREATE, commentId: 'c1', message: null}),
    ).rejects.toThrow('nope')

    expect(source.getCurrent()![0].state).toEqual({type: 'createError', error: expect.any(Error)})
  })

  it('marks a failed comment as retrying while the retry is in flight', async () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()
    client.create.mockRejectedValueOnce(new Error('nope'))
    client.createIfNotExists.mockRejectedValueOnce(new Error('nope'))

    await expect(
      createComment(instance, {...CREATE, commentId: 'c1', message: null}),
    ).rejects.toThrow('nope')

    let resolveRetry: (value: unknown) => void = () => {}
    client.create.mockReturnValue(new Promise((resolve) => (resolveRetry = resolve)))
    client.createIfNotExists.mockReturnValue(new Promise((resolve) => (resolveRetry = resolve)))

    const retry = createComment(instance, {...CREATE, commentId: 'c1', message: null})

    expect(source.getCurrent()![0].state).toEqual({type: 'createRetrying'})

    resolveRetry(comment({_id: 'c1'}))
    await retry
  })

  it('refuses to write without a logged in user', async () => {
    vi.mocked(getCurrentUserState).mockReturnValue({
      getCurrent: () => null,
      observable: of(null),
      subscribe: () => () => {},
    } as unknown as StateSource<CurrentUser | null>)

    await expect(createComment(instance, {...CREATE, message: null})).rejects.toThrow(
      /requires a logged in user/,
    )
  })

  it('refuses a comment that points at no field', async () => {
    // Not pedantry. The Studio's inspector calls `fromString` on the stored
    // path and throws on `''`, so a pathless comment crashes the inspector for
    // everyone viewing that document until someone deletes it.
    await expect(
      createComment(instance, {...HANDLE, fieldPath: '', message: null}),
    ).rejects.toThrow(/needs a field path/)

    await expect(
      createComment(instance, {...HANDLE, fieldPath: [], message: null}),
    ).rejects.toThrow(/needs a field path/)

    expect(client.createIfNotExists).not.toHaveBeenCalled()
  })
})

describe('replyToComment', () => {
  it('inherits thread, field, and status from the parent', async () => {
    seedComments(instance, {
      comments: [
        comment({
          _id: 'parent',
          threadId: 'thread-9',
          status: 'resolved',
          target: {
            documentType: 'author',
            path: {field: 'title'},
            document: {_ref: 'doc-1', _type: 'reference', _weak: true},
          },
        }),
      ],
    })

    await replyToComment(instance, {
      ...HANDLE,
      parentCommentId: 'parent',
      commentId: 'reply-1',
      message: null,
    })

    expect(client.createIfNotExists.mock.calls[0][0]).toMatchObject({
      parentCommentId: 'parent',
      threadId: 'thread-9',
      status: 'resolved',
      target: {path: {field: 'title'}},
    })
  })

  it('attaches a reply to a reply to the thread parent', async () => {
    // The Studio's threads are one level deep; a nested reply would be orphaned.
    seedComments(instance, {
      comments: [comment({_id: 'parent'}), comment({_id: 'reply-1', parentCommentId: 'parent'})],
    })

    await replyToComment(instance, {...HANDLE, parentCommentId: 'reply-1', message: null})

    expect(client.createIfNotExists.mock.calls[0][0].parentCommentId).toBe('parent')
  })

  it('explains itself when the parent is not loaded', async () => {
    await expect(
      replyToComment(instance, {...HANDLE, parentCommentId: 'unknown', message: null}),
    ).rejects.toThrow(/pass its threadId/)
  })

  it('requires the status when the parent is not loaded', async () => {
    await expect(
      replyToComment(instance, {
        ...HANDLE,
        parentCommentId: 'unknown',
        threadId: 'thread-3',
        message: null,
      }),
    ).rejects.toThrow(/pass its status/)
  })

  it('accepts explicit thread details when the parent is not loaded', async () => {
    await replyToComment(instance, {
      ...HANDLE,
      parentCommentId: 'unknown',
      threadId: 'thread-3',
      status: 'resolved',
      // With no parent to inherit from, the field has to be named too.
      fieldPath: 'name',
      message: null,
    })

    expect(client.createIfNotExists.mock.calls[0][0]).toMatchObject({
      threadId: 'thread-3',
      status: 'resolved',
    })
  })

  it('does not reuse a parent loaded for another document', async () => {
    seedComments(instance, {comments: [comment({_id: 'parent'})]})

    await expect(
      replyToComment(instance, {
        ...HANDLE,
        documentId: 'doc-2',
        parentCommentId: 'parent',
        message: null,
      }),
    ).rejects.toThrow(/not loaded/)
  })
})

describe('updateComment', () => {
  it('patches the message and stamps lastEditedAt in one transaction', async () => {
    await updateComment(instance, {commentId: 'c1', message: null})

    expect(client.transaction).toHaveBeenCalled()
    expect(patchSet).toHaveBeenCalledWith({message: null, lastEditedAt: expect.any(String)})
    expect(transactionCommit).toHaveBeenCalledWith({tag: 'comments.update'})
  })

  it('does not create a dataset just to edit a comment', async () => {
    await updateComment(instance, {commentId: 'c1', message: null})

    expect(provisionAddonDataset).not.toHaveBeenCalled()
  })

  it('does not retain a pending transaction when no comment is loaded', async () => {
    await updateComment(instance, {commentId: 'c1', message: null})

    expect(getCommentsStoreState(instance, {}).pendingTransactions).toEqual({})
  })

  it('restores the previous message when the write fails', async () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {comments: [comment({_id: 'c1', message: null})]})
    transactionCommit.mockRejectedValue(new Error('nope'))
    const message: StoredComment['message'] = [
      {_type: 'block', _key: 'block-1', children: [{_type: 'span', text: 'changed'}]},
    ]

    await expect(updateComment(instance, {commentId: 'c1', message})).rejects.toThrow('nope')

    expect(source.getCurrent()![0].message).toBe(null)
  })
})

describe('setCommentStatus', () => {
  it('patches the parent and replies in one mutation', async () => {
    await setCommentStatus(instance, {commentId: 'c1', status: 'resolved'})

    expect(client.mutate).toHaveBeenCalledWith(
      [
        {patch: {id: 'c1', set: {status: 'resolved'}}},
        {
          patch: {
            query: '*[_type == "comment" && parentCommentId == $commentId]',
            params: {commentId: 'c1'},
            set: {status: 'resolved'},
          },
        },
      ],
      {transactionId: expect.any(String), tag: 'comments.set-status'},
    )
  })

  it('moves known replies immediately rather than waiting for the echo', async () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [comment({_id: 'c1'}), comment({_id: 'r1', parentCommentId: 'c1'})],
    })

    await setCommentStatus(instance, {commentId: 'c1', status: 'resolved'})

    expect(source.getCurrent()!.every((c) => c.status === 'resolved')).toBe(true)
  })

  it('restores the parent and replies when the write fails', async () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [comment({_id: 'c1'}), comment({_id: 'r1', parentCommentId: 'c1'})],
    })
    client.mutate.mockRejectedValue(new Error('nope'))
    transactionCommit.mockRejectedValue(new Error('nope'))

    await expect(setCommentStatus(instance, {commentId: 'c1', status: 'resolved'})).rejects.toThrow(
      'nope',
    )

    expect(source.getCurrent()!.every((c) => c.status === 'open')).toBe(true)
  })
})

describe('removeComment', () => {
  it('deletes the comment and its replies in one mutation', async () => {
    await removeComment(instance, {commentId: 'c1'})

    expect(client.mutate).toHaveBeenCalledWith(
      [
        {
          delete: {
            query: '*[_type == "comment" && parentCommentId == $commentId]',
            params: {commentId: 'c1'},
          },
        },
        {delete: {id: 'c1'}},
      ],
      {tag: 'comments.remove'},
    )
  })

  it('drops the comment and its replies locally right away', async () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [
        comment({_id: 'c1'}),
        comment({_id: 'r1', parentCommentId: 'c1'}),
        comment({_id: 'other'}),
      ],
    })

    await removeComment(instance, {commentId: 'c1'})

    expect(source.getCurrent()!.map((c) => c.id)).toEqual(['other'])
  })

  it('restores the comment and replies when the write fails', async () => {
    const source = getCommentsState(instance, HANDLE)
    source.subscribe()
    seedComments(instance, {
      comments: [
        comment({_id: 'c1'}),
        comment({_id: 'r1', parentCommentId: 'c1'}),
        comment({_id: 'other'}),
      ],
    })
    client.mutate.mockRejectedValue(new Error('nope'))
    client.delete.mockRejectedValue(new Error('nope'))

    await expect(removeComment(instance, {commentId: 'c1'})).rejects.toThrow('nope')

    expect(
      source
        .getCurrent()!
        .map((c) => c.id)
        .sort(),
    ).toEqual(['c1', 'other', 'r1'])
  })
})
