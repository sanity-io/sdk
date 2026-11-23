import {type DocumentSync} from '@sanity/document-sync'
import {type SanityDocument} from '@sanity/types'
import {of, Subject} from 'rxjs'
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
  engineLocalDocument,
  subscribeToSubscriptionsAndRunEngines,
} from './engineDocuments'
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
    edit: vi.fn(() => {
      calls.push('edit')
      local = {...draft, name: 'y'}
    }),
    publish: vi.fn(() => calls.push('publish')),
    discard: vi.fn(() => calls.push('discard')),
    localDocuments: () =>
      ready ? {draft: docs.draft ? local : null, published: docs.published} : undefined,
    create: vi.fn(() => calls.push('create')),
    delete: vi.fn(() => calls.push('delete')),
    unpublish: vi.fn(() => calls.push('unpublish')),
  }
  return {engine: engine as unknown as DocumentSync, calls}
}

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

  it('sends a discard to the engine', () => {
    const {engine, calls} = fakeEngine()
    applyWithEngine(stateWith({a: engine}), [discardDocument(handle)], 't')
    expect(calls).toEqual(['discard'])
  })

  it('re-derives an edit as the queue does, so a string set goes out as a diffMatchPatch', () => {
    const {engine} = fakeEngine()
    applyWithEngine(stateWith({a: engine}), [editDocument(handle, {set: {name: 'xy'}})], 't')
    expect(engine.edit).toHaveBeenCalledWith([{diffMatchPatch: {name: '@@ -1 +1,2 @@\n x\n+y\n'}}])
  })

  it('sends the patches as given with preserveOperations', () => {
    const {engine} = fakeEngine()
    const action = editDocument(handle, {set: {name: 'xy'}}, {preserveOperations: true})
    applyWithEngine(stateWith({a: engine}), [action], 't')
    expect(engine.edit).toHaveBeenCalledWith([{set: {name: 'xy'}}])
  })

  it('sends nothing for an edit that changes nothing', () => {
    const {engine} = fakeEngine()
    applyWithEngine(stateWith({a: engine}), [editDocument(handle, {set: {name: 'x'}})], 't')
    expect(engine.edit).not.toHaveBeenCalled()
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
    expect(engine.edit).not.toHaveBeenCalled()
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
    expect(engine.create).toHaveBeenCalledWith({_type: 'author', name: 'new'})
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
    expect(engine.edit).not.toHaveBeenCalled()
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

  function setup(experimental_documentSync: boolean) {
    instance = createSanityInstance({projectId: 'p', dataset: 'd', experimental_documentSync})
    const state = createStoreState({
      documentStates: {},
      engines: {},
      engineChanges: 0,
      sharedListener: {events: new Subject(), dispose: () => {}},
      fetchDocument: () => of(null),
    } as unknown as DocumentStoreState)
    const key = {name: 'p.d', resource: {projectId: 'p', dataset: 'd'}}
    const subscription = subscribeToSubscriptionsAndRunEngines({instance, state, key})
    const subscribe = (...ids: string[]) =>
      state.set('documentStates', {
        documentStates: Object.fromEntries(ids.map((id) => [id, {id, subscriptions: ['s']}])),
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

  it('runs no engines when the option is off', () => {
    const {state, subscription, subscribe} = setup(false)
    subscribe('drafts.a', 'a')
    expect(state.get().engines).toEqual({})
    subscription.unsubscribe()
  })
})
