import {type DocumentSync} from '@sanity/document-sync'
import {type SanityDocument} from '@sanity/types'
import {of, Subject} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {createStoreState} from '../store/createStoreState'
import {discardDocument, editDocument, publishDocument} from './actions'
import {type DocumentStoreState} from './documentStore'
import {
  applyWithEngine,
  engineLocalDocument,
  subscribeToSubscriptionsAndRunEngines,
} from './engineDocuments'

const draft = {_id: 'drafts.a', _type: 'author', _rev: 'r1', name: 'x'} as unknown as SanityDocument

function fakeEngine(ready = true) {
  let local: SanityDocument | null = draft
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
  }
  return {engine: engine as unknown as DocumentSync, calls}
}

const stateWith = (engines: DocumentStoreState['engines']) =>
  ({engines, documentStates: {}}) as unknown as DocumentStoreState
const handle = {documentId: 'a', documentType: 'author'}

describe('applyWithEngine', () => {
  it('sends edits, publishes and discards of one document to its engine, in order', () => {
    const {engine, calls} = fakeEngine()
    const routed = applyWithEngine(stateWith({a: engine}), [
      editDocument(handle, {set: {name: 'y'}}),
      publishDocument(handle),
      discardDocument(handle),
    ])
    expect(calls).toEqual(['edit', 'publish', 'discard'])
    // The local view from before the actions, for `ActionsResult.previous`.
    expect(routed?.previous).toEqual(draft)
  })

  it('re-derives an edit as the queue does, so a string set goes out as a diffMatchPatch', () => {
    const {engine} = fakeEngine()
    applyWithEngine(stateWith({a: engine}), [editDocument(handle, {set: {name: 'xy'}})])
    expect(engine.edit).toHaveBeenCalledWith([{diffMatchPatch: {name: '@@ -1 +1,2 @@\n x\n+y\n'}}])
  })

  it('sends the patches as given with preserveOperations', () => {
    const {engine} = fakeEngine()
    const action = editDocument(handle, {set: {name: 'xy'}}, {preserveOperations: true})
    applyWithEngine(stateWith({a: engine}), [action])
    expect(engine.edit).toHaveBeenCalledWith([{set: {name: 'xy'}}])
  })

  it('sends nothing for an edit that changes nothing', () => {
    const {engine} = fakeEngine()
    applyWithEngine(stateWith({a: engine}), [editDocument(handle, {set: {name: 'x'}})])
    expect(engine.edit).not.toHaveBeenCalled()
  })

  it('finds the engine from a draft id', () => {
    const {engine} = fakeEngine()
    const actions = [editDocument({...handle, documentId: 'drafts.a'}, {set: {name: 'y'}})]
    expect(applyWithEngine(stateWith({a: engine}), actions)?.engine).toBe(engine)
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
    expect(applyWithEngine(stateWith(engines ?? {a: engine}), actions)).toBeUndefined()
    expect(engine.edit).not.toHaveBeenCalled()
  })

  it('leaves a document to the transaction queue until its engine has a snapshot', () => {
    const {engine} = fakeEngine(false)
    const actions = [editDocument(handle, {set: {name: 'y'}})]
    expect(applyWithEngine(stateWith({a: engine}), actions)).toBeUndefined()
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
