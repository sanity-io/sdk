import {ClientError, ServerError} from '@sanity/client'
import {type DocumentSync, type Operation} from '@sanity/document-sync'
import {type SanityDocument} from '@sanity/types'
import {concat, defer, NEVER, type Observable, of, Subject, throwError} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {createStoreState} from '../store/createStoreState'
import {
  type Action,
  createDocument,
  deleteDocument,
  discardDocument,
  editDocument,
  publishDocument,
  unpublishDocument,
} from './actions'
import {type DocumentStoreState} from './documentStore'
import {
  applyWithEngine,
  discardOtherUsersEdits,
  emitAccepted,
  emitDropped,
  emitSubmitFailed,
  engineLocalDocument,
  settleOnEcho,
  subscribeToSubscriptionsAndRunEngines,
} from './engineDocuments'
import {type DocumentEvent} from './events'
import {createGrantsLookup, type DatasetAcl} from './permissions'
import {PermissionActionError} from './processActions/shared'

/** Read, update and create on every document. */
const fullGrants = createGrantsLookup([
  {filter: '_id in path("**")', permissions: ['read', 'update', 'create', 'history']},
] as DatasetAcl)

const draft = {_id: 'drafts.a', _type: 'author', _rev: 'r1', name: 'x'} as unknown as SanityDocument

function fakeEngine(
  ready = true,
  docs: {draft: SanityDocument | null; published: SanityDocument | null} = {draft, published: null},
) {
  let local: SanityDocument | null = docs.draft ?? docs.published
  const calls: string[] = []
  const engine = {
    remote: () => (ready ? {draft, published: null} : undefined),
    local: () => local,
    localDocuments: () =>
      ready ? {draft: docs.draft ? local : null, published: docs.published} : undefined,
    apply: vi.fn((operations: Operation[], {transactionId = 'random'} = {}) => {
      calls.push(...operations.map((operation) => operation.type))
      if (operations.some((operation) => operation.type === 'edit')) local = {...draft, name: 'y'}
      return transactionId
    }),
  }
  return {engine: engine as unknown as DocumentSync, calls}
}

/** The patches of the edit operations the engine was given. */
const sentPatches = (engine: DocumentSync) =>
  vi
    .mocked(engine.apply)
    .mock.calls.flatMap(([operations]) =>
      operations.flatMap((operation) => (operation.type === 'edit' ? operation.patches : [])),
    )

/** A store whose queue has loaded grants and document `a`, with nothing unfinished. */
const stateWith = (
  engines: DocumentStoreState['engines'],
  queue: Partial<DocumentStoreState> = {},
) =>
  ({
    engines,
    grants: fullGrants,
    documentStates: {'a': {id: 'a', local: null}, 'drafts.a': {id: 'drafts.a', local: draft}},
    queued: [],
    applied: [],
    engineTransactions: new Map(),
    events: new Subject(),
    ...queue,
  }) as unknown as DocumentStoreState
const handle = {documentId: 'a', documentType: 'author'}

describe('applyWithEngine', () => {
  it('sends the actions of one document to its engine, in order', () => {
    const {engine, calls} = fakeEngine()
    const routed = applyWithEngine(
      stateWith({a: engine}),
      [editDocument(handle, {set: {name: 'y'}}), publishDocument(handle)],
      't',
    )
    expect(calls).toEqual(['edit', 'publish'])
    // The local view from before the actions, for `ActionsResult.previous`.
    expect(routed?.previous).toEqual(draft)
  })

  it('sends all the actions of one call as one transaction under the caller id', () => {
    const {engine} = fakeEngine()
    applyWithEngine(
      stateWith({a: engine}),
      [editDocument(handle, {set: {name: 'y'}}), publishDocument(handle)],
      'caller',
    )
    expect(engine.apply).toHaveBeenCalledTimes(1)
    expect(engine.apply).toHaveBeenCalledWith(
      [{type: 'edit', patches: [expect.anything()]}, {type: 'publish'}],
      {transactionId: 'caller'},
    )
  })

  it('sends a discard to the engine', () => {
    const {engine, calls} = fakeEngine()
    applyWithEngine(stateWith({a: engine}), [discardDocument(handle)], 't')
    expect(calls).toEqual(['discard'])
  })

  it('re-derives an edit as the queue does, so a string set goes out as a diffMatchPatch', () => {
    const {engine} = fakeEngine()
    applyWithEngine(stateWith({a: engine}), [editDocument(handle, {set: {name: 'xy'}})], 't')
    expect(sentPatches(engine)).toEqual([{diffMatchPatch: {name: '@@ -1 +1,2 @@\n x\n+y\n'}}])
  })

  it('sends the patches as given with preserveOperations', () => {
    const {engine} = fakeEngine()
    const action = editDocument(handle, {set: {name: 'xy'}}, {preserveOperations: true})
    applyWithEngine(stateWith({a: engine}), [action], 't')
    expect(sentPatches(engine)).toEqual([{set: {name: 'xy'}}])
  })

  it('sends nothing for an edit that changes nothing', () => {
    const {engine} = fakeEngine()
    applyWithEngine(stateWith({a: engine}), [editDocument(handle, {set: {name: 'x'}})], 't')
    expect(engine.apply).not.toHaveBeenCalled()
  })

  it('finds the engine from a draft id', () => {
    const {engine} = fakeEngine()
    const actions = [editDocument({...handle, documentId: 'drafts.a'}, {set: {name: 'y'}})]
    expect(applyWithEngine(stateWith({a: engine}), actions, 't')?.engine).toBe(engine)
  })

  it.each([
    ['no engine for the document', {}, [editDocument(handle, {set: {name: 'y'}})]],
    ['a liveEdit document', undefined, [editDocument({...handle, liveEdit: true}, {set: {n: 1}})]],
    [
      'a release version',
      undefined,
      [editDocument({...handle, perspective: {releaseName: 'r'}}, {set: {n: 1}})],
    ],
    [
      'two documents',
      undefined,
      [
        editDocument(handle, {set: {n: 1}}),
        editDocument({documentId: 'b', documentType: 'author'}, {set: {n: 1}}),
      ],
    ],
  ])('leaves %s to the transaction queue', (_name, engines, actions) => {
    const {engine} = fakeEngine()
    expect(applyWithEngine(stateWith(engines ?? {a: engine}), actions, 't')).toBeUndefined()
    expect(engine.apply).not.toHaveBeenCalled()
  })

  it('leaves a document to the transaction queue until its engine has a snapshot', () => {
    const {engine} = fakeEngine(false)
    const actions = [editDocument(handle, {set: {name: 'y'}})]
    expect(applyWithEngine(stateWith({a: engine}), actions, 't')).toBeUndefined()
  })
})

describe('create, delete and unpublish', () => {
  const published = {
    _id: 'a',
    _type: 'author',
    _rev: 'p1',
    name: 'pub',
  } as unknown as SanityDocument

  it('creates the draft from the published document plus the initial value', () => {
    const {engine} = fakeEngine(true, {draft: null, published})
    applyWithEngine(stateWith({a: engine}), [createDocument(handle, {name: 'new'})], 't')
    expect(engine.apply).toHaveBeenCalledWith(
      [{type: 'create', attributes: expect.objectContaining({_type: 'author', name: 'new'})}],
      {transactionId: 't'},
    )
  })

  it.each([
    ['unpublish', unpublishDocument(handle)],
    ['delete', deleteDocument(handle)],
  ])('sends %s of a published document to the engine', (name, action) => {
    const {engine, calls} = fakeEngine(true, {draft, published})
    applyWithEngine(stateWith({a: engine}), [action], 't')
    expect(calls).toEqual([name])
  })

  it.each([
    ['create with a draft', {draft, published: null}, createDocument(handle), /draft of this/],
    ['delete of a draft only', {draft, published: null}, deleteDocument(handle), /without a pub/],
    ['delete of nothing', {draft: null, published: null}, deleteDocument(handle), /not exist/],
    ['unpublish of a draft', {draft, published: null}, unpublishDocument(handle), /not currently/],
  ])('fails %s as the queue does', (_name, docs, action, message) => {
    const {engine, calls} = fakeEngine(true, docs)
    expect(() => applyWithEngine(stateWith({a: engine}), [action], 't')).toThrow(message)
    expect(calls).toEqual([])
  })
})

describe('permissions', () => {
  const readOnly = createGrantsLookup([
    {filter: '_id in path("**")', permissions: ['read']},
  ] as DatasetAcl)
  const published = {
    _id: 'a',
    _type: 'author',
    _rev: 'p1',
    name: 'pub',
  } as unknown as SanityDocument

  it.each([
    [
      'an edit',
      {draft, published: null},
      editDocument(handle, {set: {name: 'y'}}),
      /edit document/,
    ],
    ['a create', {draft: null, published}, createDocument(handle), /create a draft/],
    ['a delete', {draft: null, published}, deleteDocument(handle), /delete this document/],
    ['an unpublish', {draft: null, published}, unpublishDocument(handle), /unpublish/],
  ])('rejects %s the grants do not allow, as the queue does', (_name, docs, action, message) => {
    const {engine, calls} = fakeEngine(true, docs)
    const state = stateWith({a: engine}, {grants: readOnly})
    expect(() => applyWithEngine(state, [action], 't')).toThrow(PermissionActionError)
    expect(() => applyWithEngine(state, [action], 't')).toThrow(message)
    expect(calls).toEqual([])
  })

  it('sends nothing when a later action in the call fails', () => {
    const {engine, calls} = fakeEngine()
    const actions = [editDocument(handle, {set: {name: 'y'}}), createDocument(handle)]
    expect(() => applyWithEngine(stateWith({a: engine}), actions, 't')).toThrow(/already exists/)
    expect(calls).toEqual([])
  })
})

describe('queue ownership', () => {
  const queued = (...actions: Action[]) => ({queued: [{transactionId: 't', actions}]})

  it.each([
    ['queued', queued(createDocument({documentId: 'drafts.a', documentType: 'author'}))],
    ['applied', {applied: [{transactionId: 't', actions: [unpublishDocument(handle)]}]}],
    ['outgoing', {outgoing: {transactionId: 't', actions: [publishDocument(handle)]}}],
  ])('leaves a document to the queue while it has a %s transaction for it', (_name, queue) => {
    const {engine} = fakeEngine()
    const state = stateWith({a: engine}, queue as Partial<DocumentStoreState>)
    expect(engineLocalDocument(state, handle)).toBeUndefined()
    expect(applyWithEngine(state, [editDocument(handle, {set: {name: 'y'}})], 't')).toBeUndefined()
    expect(engine.apply).not.toHaveBeenCalled()
  })

  it.each([
    ['another document', queued(editDocument({documentId: 'b', documentType: 'author'}, {}))],
    [
      'a release version of it',
      queued(editDocument({...handle, perspective: {releaseName: 'r'}}, {set: {n: 1}})),
    ],
  ])('keeps the engine when the queue only has %s', (_name, queue) => {
    const {engine} = fakeEngine()
    expect(engineLocalDocument(stateWith({a: engine}, queue), handle)).toEqual(draft)
  })

  it.each([
    ['grants', {grants: undefined}],
    ['the draft', {documentStates: {a: {id: 'a', local: null}}}],
    ['the published document', {documentStates: {'drafts.a': {id: 'drafts.a', local: draft}}}],
  ])('leaves a document to the queue until the queue has loaded %s', (_name, queue) => {
    const {engine} = fakeEngine()
    const state = stateWith({a: engine}, queue as Partial<DocumentStoreState>)
    expect(engineLocalDocument(state, handle)).toBeUndefined()
  })
})

describe('document events', () => {
  const editAction = editDocument(handle, {set: {name: 'y'}})
  const httpEdit = [
    {actionType: 'sanity.action.document.edit', draftId: 'drafts.a', publishedId: 'a'},
  ]

  function sent() {
    const {engine} = fakeEngine()
    const state = stateWith({a: engine})
    const events: DocumentEvent[] = []
    state.events.subscribe((event) => events.push(event))
    const routed = applyWithEngine(state, [editAction], 'caller')
    return {state, events, routed}
  }

  it('records the engine transaction under the caller id, with the SDK actions', () => {
    const {state, routed} = sent()
    expect(routed?.transactionIds).toEqual(['caller'])
    expect(state.engineTransactions.get('caller')).toMatchObject({
      actions: [editAction],
      callerTransactionId: 'caller',
      previous: {'drafts.a': draft, 'a': null},
      working: {'drafts.a': {name: 'y'}},
    })
  })

  it('emits the per-document event and accepted once the server accepts it', () => {
    const {state, events} = sent()
    emitAccepted(state, 'caller', httpEdit as never, {transactionId: 'caller'} as never)
    expect(events.map((event) => event.type)).toEqual(['edited', 'accepted'])
    expect(events[0]).toMatchObject({
      documentId: 'a',
      outgoing: {transactionId: 'caller', batchedTransactionIds: ['caller'], actions: [editAction]},
    })
    expect(state.engineTransactions.has('caller')).toBe(false)
  })

  it('emits submission-failed with a growing attempt count for a retried submission', () => {
    const {state, events} = sent()
    const unavailable = new ServerError({statusCode: 503, headers: {}, body: {}})
    emitSubmitFailed(state, 'caller', httpEdit as never, unavailable)
    emitSubmitFailed(state, 'caller', httpEdit as never, unavailable)
    expect(events).toMatchObject([
      {type: 'submission-failed', attempt: 1},
      {type: 'submission-failed', attempt: 2},
    ])
  })

  it('treats a resend of a transaction that already landed as accepted', () => {
    const {state, events} = sent()
    const exists = new ClientError({
      statusCode: 409,
      headers: {},
      body: {error: {type: 'transactionAlreadyExistsError', description: 'exists'}},
    })
    emitSubmitFailed(state, 'caller', httpEdit as never, exists)
    expect(events.map((event) => event.type)).toEqual(['edited', 'accepted'])
  })

  it('accepts a submission when the listener echoes it, for a write whose response was lost', async () => {
    const {state, events} = sent()
    const listener = new Subject<{type: string; transactionId?: string}>()
    settleOnEcho(state, listener, 'caller', httpEdit)
    listener.next({type: 'mutation', transactionId: 'other'})
    expect(events).toEqual([])
    const settled = state.engineTransactions.get('caller')!.settled
    listener.next({type: 'mutation', transactionId: 'caller'})
    expect(events.map((event) => event.type)).toEqual(['edited', 'accepted'])
    await expect(settled).resolves.toEqual({})
    // The response arriving after the echo finds nothing left to accept.
    emitAccepted(state, 'caller', httpEdit as never, {transactionId: 'caller'} as never)
    expect(events).toHaveLength(2)
    expect(listener.observed).toBe(false)
  })

  it('stops watching for the echo once the transaction is reverted', async () => {
    const {state} = sent()
    const listener = new Subject<{type: string}>()
    settleOnEcho(state, listener, 'caller', httpEdit)
    const transaction = {transactionId: 'caller', actions: httpEdit, submitted: true}
    emitDropped(state, {transaction, reason: 'rejected', error: new Error('no')} as never, 'doc1')
    await vi.waitFor(() => expect(listener.observed).toBe(false))
  })

  it('emits edit-no-op for an accepted no-op, and reverted when the engine drops a transaction', () => {
    const {state, events} = sent()
    const transaction = {transactionId: 'caller', actions: httpEdit, submitted: true}
    const noOps = [{op: 'set', path: 'items[_key=="gone"].title', reason: 'target not found'}]
    emitDropped(state, {transaction, reason: 'no-op', noOps} as never, 'doc1')
    expect(events).toEqual([
      {type: 'edit-no-op', documentId: 'drafts.doc1', transactionId: 'caller', noOps},
    ])
    events.length = 0
    emitDropped(state, {transaction, reason: 'rejected', error: new Error('no')} as never, 'doc1')
    expect(events).toMatchObject([
      {type: 'reverted', message: 'no', outgoing: {batchedTransactionIds: ['caller']}},
    ])
  })
})

describe('batched edits', () => {
  function twoEdits() {
    const {engine} = fakeEngine()
    const state = stateWith({a: engine})
    const events: DocumentEvent[] = []
    state.events.subscribe((event) => events.push(event))
    applyWithEngine(state, [editDocument(handle, {set: {name: 'y'}})], 'one')
    applyWithEngine(state, [editDocument(handle, {set: {name: 'z'}})], 'two')
    const settled = ['one', 'two'].map((id) => state.engineTransactions.get(id)!.settled)
    return {state, events, settled}
  }
  const httpEdits = [
    {actionType: 'sanity.action.document.edit', draftId: 'drafts.a', publishedId: 'a'},
    {actionType: 'sanity.action.document.edit', draftId: 'drafts.a', publishedId: 'a'},
  ]

  it('reports a batch as one accepted transaction carrying every caller id', async () => {
    const {state, events, settled} = twoEdits()
    emitAccepted(state, 'two', httpEdits as never, {transactionId: 'two'} as never, ['one', 'two'])
    expect(events.filter((e) => e.type === 'accepted')).toMatchObject([
      {outgoing: {transactionId: 'two', batchedTransactionIds: ['one', 'two']}},
    ])
    await expect(Promise.all(settled)).resolves.toEqual([{}, {}])
    expect(state.engineTransactions.size).toBe(0)
  })

  it('reverts every transaction in a batch the server rejected', async () => {
    const {state, events, settled} = twoEdits()
    const transaction = {
      transactionId: 'two',
      actions: httpEdits,
      submitted: false,
      batchedTransactionIds: ['one', 'two'],
    }
    emitDropped(state, {transaction, reason: 'rejected', error: new Error('no')} as never, 'doc1')
    expect(events).toMatchObject([
      {type: 'reverted', outgoing: {batchedTransactionIds: ['one', 'two']}},
    ])
    const outcomes = await Promise.all(settled)
    expect(outcomes.map((o) => (o.error as Error).message)).toEqual(['no', 'no'])
  })
})

describe('signed-in user changes', () => {
  function sentBy(author: string | undefined) {
    const {engine} = fakeEngine()
    const discardPending = vi.fn()
    const retryNow = vi.fn()
    Object.assign(engine, {discardPending, retryNow})
    const state = stateWith({a: engine})
    const events: DocumentEvent[] = []
    state.events.subscribe((event) => events.push(event))
    applyWithEngine(state, [editDocument(handle, {set: {name: 'y'}})], 'caller', author)
    return {state, events, discardPending, retryNow}
  }

  it("drops another user's unsent transactions from their engine and wakes every engine", () => {
    const {state, discardPending, retryNow} = sentBy('user-a')
    discardOtherUsersEdits(state, 'user-b')
    expect(discardPending).toHaveBeenCalledWith(['caller'])
    expect(retryNow).toHaveBeenCalled()
  })

  it('binds a transaction with no author to the confirmed user and keeps it', () => {
    const {state, discardPending} = sentBy(undefined)
    discardOtherUsersEdits(state, 'user-b')
    expect(discardPending).not.toHaveBeenCalled()
    expect(state.engineTransactions.get('caller')?.author).toBe('user-b')
  })

  it('reports a discarded transaction as reverted, with the user-changed message', async () => {
    const {state, events} = sentBy('user-a')
    const {settled} = state.engineTransactions.get('caller')!
    const transaction = {transactionId: 'caller', actions: [], submitted: false}
    emitDropped(state, {transaction, reason: 'discarded'}, 'doc1')
    expect(events).toMatchObject([
      {type: 'reverted', message: expect.stringMatching(/signed-in user changed/)},
    ])
    await expect(settled).resolves.toMatchObject({error: expect.any(Error)})
  })
})

describe('engineLocalDocument', () => {
  it("reads the ready engine's local view", () => {
    const {engine} = fakeEngine()
    expect(engineLocalDocument(stateWith({a: engine}), handle)).toEqual(draft)
  })

  it('is undefined when the engine does not handle the document', () => {
    const {engine} = fakeEngine(false)
    expect(engineLocalDocument(stateWith({a: engine}), handle)).toBeUndefined()
    expect(engineLocalDocument(stateWith({}), handle)).toBeUndefined()
  })
})

describe('subscribeToSubscriptionsAndRunEngines', () => {
  let instance: SanityInstance
  afterEach(() => instance.dispose())

  function setup(
    experimental_documentSync: boolean,
    {
      events = new Subject<never>() as Observable<never>,
      fetchDocument = () => of(null),
    }: {events?: Observable<never>; fetchDocument?: (id: string) => Observable<null>} = {},
  ) {
    instance = createSanityInstance({projectId: 'p', dataset: 'd', experimental_documentSync})
    const state = createStoreState({
      documentStates: {},
      engines: {},
      engineChanges: 0,
      engineTransactions: new Map(),
      sharedListener: {events, dispose: () => {}},
      fetchDocument,
    } as unknown as DocumentStoreState)
    const key = {name: 'p.d', resource: {projectId: 'p', dataset: 'd'}}
    const subscription = subscribeToSubscriptionsAndRunEngines({instance, state, key})
    const subscribe = (...ids: string[]) =>
      state.set('documentStates', {
        documentStates: Object.fromEntries(
          ids.map((id) => [id, {id, subscriptions: ['s'], local: null}]),
        ),
      })
    return {state, subscription, subscribe}
  }

  it('keeps one engine per subscribed document, by published id', () => {
    const {state, subscription, subscribe} = setup(true)
    subscribe('drafts.a', 'a', 'versions.r.a')
    expect(Object.keys(state.get().engines)).toEqual(['a'])
    subscribe()
    expect(state.get().engines).toEqual({})
    subscription.unsubscribe()
  })

  it('starts an engine only once the queue has loaded the draft and the published document', () => {
    const {state, subscription} = setup(true)
    state.set('documentStates', {
      documentStates: {
        'a': {id: 'a', subscriptions: ['s']},
        'drafts.a': {id: 'drafts.a', subscriptions: ['s']},
      },
    } as never)
    expect(state.get().engines).toEqual({})
    state.set('documentStates', {
      documentStates: {
        'a': {id: 'a', subscriptions: ['s'], local: null},
        'drafts.a': {id: 'drafts.a', subscriptions: ['s'], local: null},
      },
    } as never)
    expect(Object.keys(state.get().engines)).toEqual(['a'])
    subscription.unsubscribe()
  })

  it('starts an engine from the documents the queue has loaded, without reading them again', async () => {
    const fetchDocument = vi.fn(() => of(null))
    // The shared listener replays its `welcome` to a late subscriber, which starts the fetch.
    const events = concat(of({type: 'welcome'}), NEVER) as Observable<never>
    const {state, subscription} = setup(true, {fetchDocument, events})
    const published = {_id: 'a', _type: 'author', _rev: 'p1'}
    const remoteDraft = {_id: 'drafts.a', _type: 'author', _rev: 'r1', name: 'loaded'}
    state.set('documentStates', {
      documentStates: {
        'a': {id: 'a', subscriptions: ['s'], local: published, remote: published},
        'drafts.a': {id: 'drafts.a', subscriptions: ['s'], local: remoteDraft, remote: remoteDraft},
      },
    } as never)
    await state.get().engines['a']!.ready()
    expect(fetchDocument).not.toHaveBeenCalled()
    expect(state.get().engines['a']!.remote()).toEqual({draft: remoteDraft, published})
    subscription.unsubscribe()
  })

  it("subscribes to the listener again after it errors, as the queue's listener does", async () => {
    let subscriptions = 0
    const events = defer(() =>
      ++subscriptions === 1 ? throwError(() => new Error('Listener channel error')) : NEVER,
    )
    const {subscription, subscribe} = setup(true, {events: events as Observable<never>})
    subscribe('drafts.a', 'a')
    await vi.waitFor(() => expect(subscriptions).toBe(2))
    subscription.unsubscribe()
  })

  it('runs no engines when the option is off', () => {
    const {state, subscription, subscribe} = setup(false)
    subscribe('drafts.a', 'a')
    expect(state.get().engines).toEqual({})
    subscription.unsubscribe()
  })
})
