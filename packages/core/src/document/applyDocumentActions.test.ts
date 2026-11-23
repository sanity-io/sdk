import {type DocumentSync} from '@sanity/document-sync'
import {type SanityDocument} from '@sanity/types'
import {Subject} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {bindActionByResource} from '../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {createStoreState, type StoreState} from '../store/createStoreState'
import {type DocumentAction} from './actions'
import {type DocumentStoreState} from './documentStore'
import {type DocumentEvent} from './events'
import {createGrantsLookup, type DatasetAcl} from './permissions'
import {type AppliedTransaction, type OutgoingTransaction} from './reducers'

vi.mock('../store/createActionBinder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store/createActionBinder')>()),
  bindActionByResource: vi.fn(),
}))

type TestState = Pick<
  DocumentStoreState,
  | 'documentStates'
  | 'queued'
  | 'applied'
  | 'outgoing'
  | 'error'
  | 'events'
  | 'engines'
  | 'grants'
  | 'engineTransactions'
>

const exampleDoc: SanityDocument = {
  _createdAt: new Date().toISOString(),
  _updatedAt: new Date().toISOString(),
  _type: 'author',
  _id: 'doc1',
  _rev: 'txn0',
}

describe('applyDocumentActions', () => {
  let state: StoreState<TestState>
  let instance: SanityInstance
  let eventsSubject: Subject<DocumentEvent>
  let applyDocumentActions: typeof import('./applyDocumentActions').applyDocumentActions

  beforeEach(async () => {
    eventsSubject = new Subject<DocumentEvent>()
    const initialState: TestState = {
      documentStates: {},
      queued: [],
      applied: [],
      outgoing: undefined,
      error: undefined,
      events: eventsSubject,
      engines: {},
      engineTransactions: new Map(),
    }
    state = createStoreState(initialState)
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const key = {name: 'p.d', resource: {projectId: 'p', dataset: 'd'}}

    vi.mocked(bindActionByResource).mockImplementation(
      (_storeDef, action) => (instanceParam: SanityInstance, options) =>
        action({instance: instanceParam, state, key}, options),
    )
    // Import dynamically to ensure mocks are set up before the module under test is loaded
    const module = await import('./applyDocumentActions')
    applyDocumentActions = module.applyDocumentActions
  })

  afterEach(() => {
    instance.dispose()
  })

  it('resolves an empty transaction without queueing it', async () => {
    const result = await applyDocumentActions(instance, {
      actions: [],
      transactionId: 'txn-empty',
      resource: {projectId: 'p', dataset: 'd'},
    })

    expect(result).toMatchObject({
      transactionId: 'txn-empty',
      documents: {},
      previous: {},
      previousRevs: {},
      appeared: [],
      updated: [],
      disappeared: [],
    })
    // Nothing was sent, so `submitted()` resolves instead of waiting for an
    // accepted event that never arrives.
    await expect(result.submitted()).resolves.toEqual({transactionId: 'txn-empty'})
    expect(state.get().queued).toEqual([])
    expect(state.get().applied).toEqual([])
  })

  it('resolves with a successful applied transaction and accepted event', async () => {
    const action: DocumentAction = {
      type: 'document.edit',
      documentId: 'doc1',
      documentType: 'example',
      patches: [{set: {foo: 'bar'}}],
    }

    // Call applyDocumentActions with a fixed transactionId for reproducibility.
    const applyPromise = applyDocumentActions(instance, {
      actions: [action],
      transactionId: 'txn-success',
      resource: {projectId: 'p', dataset: 'd'},
    })

    const appliedTx: AppliedTransaction = {
      transactionId: 'txn-success',
      actions: [action],
      disableBatching: false,
      outgoingActions: [],
      outgoingMutations: [],
      // Simulated base, previous, and working document sets.
      base: {doc1: {...exampleDoc, _id: 'doc1', foo: 'old', _rev: 'rev-old'}},
      working: {doc1: {...exampleDoc, _id: 'doc1', foo: 'bar', _rev: 'rev-new'}},
      previous: {doc1: {...exampleDoc, _id: 'doc1', foo: 'old', _rev: 'rev-old'}},
      previousRevs: {doc1: 'rev-old'},
      timestamp: new Date().toISOString(),
    }
    // Update the state so that its "applied" array contains our applied transaction.
    state.set('simulateApplied', {applied: [appliedTx]})

    // Await the resolution of applyDocumentActions. This should pick up the applied transaction.
    const result = await applyPromise

    // Check that the result fields match the simulated applied transaction.
    expect(result.transactionId).toEqual('txn-success')
    expect(result.documents).toEqual(appliedTx.working)
    expect(result.previous).toEqual(appliedTx.previous)
    expect(result.previousRevs).toEqual(appliedTx.previousRevs)
    // In this simple example, since "doc1" exists both in previous and working,
    // it should be reported as updated.
    expect(result.updated).toEqual(['doc1'])
    expect(result.appeared).toEqual([])
    expect(result.disappeared).toEqual([])

    const acceptedResult = {transactionId: 'accepted-result'}
    const acceptedEvent: DocumentEvent = {
      type: 'accepted',
      outgoing: {batchedTransactionIds: ['txn-success']} as OutgoingTransaction,
      result: acceptedResult,
    }
    eventsSubject.next(acceptedEvent)

    // Call the submitted function and await its result.
    const submittedResult = await result.submitted()
    expect(submittedResult).toEqual(acceptedResult)
  })

  it('throws an error if a transaction error event is emitted', async () => {
    const action: DocumentAction = {
      type: 'document.edit',
      documentId: 'doc1',
      documentType: 'example',
      patches: [{set: {foo: 'error'}}],
    }

    // Call applyDocumentActions with a fixed transactionId.
    const applyPromise = applyDocumentActions(instance, {
      actions: [action],
      transactionId: 'txn-error',
      resource: {projectId: 'p', dataset: 'd'},
    })

    const errorEvent: DocumentEvent = {
      type: 'error',
      transactionId: 'txn-error',
      message: 'Simulated error',
      error: new Error('Simulated error'),
      documentId: 'doc1',
    }
    eventsSubject.next(errorEvent)

    await expect(applyPromise).rejects.toThrow('Simulated error')
  })

  it('uses the explicit resource when it does not match the instance config', async () => {
    // The instance is configured for one resource...
    const scopedInstance = createSanityInstance({projectId: 'child-p', dataset: 'child-d'})
    // ...while the action refers to a different one
    const action: DocumentAction = {
      type: 'document.edit',
      documentId: 'doc1',
      documentType: 'example',
      patches: [{set: {foo: 'childTest'}}],
      projectId: 'p',
      dataset: 'd',
    }
    // The explicit `resource` option should win over the instance's own config
    const applyPromise = applyDocumentActions(scopedInstance, {
      actions: [action],
      transactionId: 'txn-child-match',
      resource: {projectId: 'p', dataset: 'd'},
    })

    // Simulate an applied transaction for the explicitly-passed resource
    const appliedTx: AppliedTransaction = {
      transactionId: 'txn-child-match',
      actions: [action],
      disableBatching: false,
      outgoingActions: [],
      outgoingMutations: [],
      base: {doc1: {...exampleDoc, _id: 'doc1', foo: 'old', _rev: 'rev-old'}},
      working: {doc1: {...exampleDoc, _id: 'doc1', foo: 'childTest', _rev: 'rev-new'}},
      previous: {doc1: {...exampleDoc, _id: 'doc1', foo: 'old', _rev: 'rev-old'}},
      previousRevs: {doc1: 'rev-old'},
      timestamp: new Date().toISOString(),
    }
    state.set('simulateApplied', {applied: [appliedTx]})

    const result = await applyPromise
    expect(result.transactionId).toEqual('txn-child-match')
    expect(result.documents).toEqual(appliedTx.working)
    expect(result.previous).toEqual(appliedTx.previous)
    expect(result.previousRevs).toEqual(appliedTx.previousRevs)

    const acceptedResult = {transactionId: 'accepted-child'}
    const acceptedEvent: DocumentEvent = {
      type: 'accepted',
      outgoing: {batchedTransactionIds: ['txn-child-match']} as OutgoingTransaction,
      result: acceptedResult,
    }
    eventsSubject.next(acceptedEvent)
    const submittedResult = await result.submitted()
    expect(submittedResult).toEqual(acceptedResult)

    scopedInstance.dispose()
  })

  it('normalizes actions for the bound resource before queueing', async () => {
    // A plain edit action with no `liveEdit` flag. Canvas forces liveEdit, so
    // the queued action should come back with `liveEdit: true` — proving that
    // `applyDocumentActions` runs `normalizeActionsForResource`.
    const action: DocumentAction = {
      type: 'document.edit',
      documentId: 'doc1',
      documentType: 'sanity.canvas.document',
      patches: [{set: {foo: 'bar'}}],
    }

    // Don't await — we only need to inspect the synchronously-queued transaction.
    applyDocumentActions(instance, {
      actions: [action],
      transactionId: 'txn-normalize',
      resource: {canvasId: 'c'},
    })

    const queued = state.get().queued.find((t) => t.transactionId === 'txn-normalize')
    expect(queued).toBeDefined()
    const [queuedAction] = queued!.actions
    expect(queuedAction).toMatchObject({type: 'document.edit', liveEdit: true})
  })
  /** A loaded document `doc1` served by a fake engine. */
  function engineServes() {
    let local: SanityDocument = {...exampleDoc, _id: 'drafts.doc1'}
    const engine = {
      remote: () => ({draft: local, published: null}),
      local: () => local,
      apply: vi.fn((_operations: unknown, {transactionId}: {transactionId: string}) => {
        local = {...local, _rev: transactionId}
        return transactionId
      }),
      localDocuments: () => ({draft: local, published: null}),
    }
    // The engine serves a document only once the queue has loaded it and the grants.
    state.set('loaded', {
      grants: createGrantsLookup([
        {filter: '_id in path("**")', permissions: ['read', 'update', 'create']},
      ] as DatasetAcl),
      documentStates: {
        'doc1': {id: 'doc1', local: null},
        'drafts.doc1': {id: 'drafts.doc1', local},
      } as unknown as DocumentStoreState['documentStates'],
    })
    state.set('addEngine', {engines: {doc1: engine as unknown as DocumentSync}})

    return {engine}
  }

  it('hands edits of a document with a ready engine to the engine instead of the queue', async () => {
    const {engine} = engineServes()
    const result = await applyDocumentActions(instance, {
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'author',
          patches: [{set: {name: 'y'}}],
        },
      ],
      transactionId: 'txn-caller',
    })

    expect(engine.apply).toHaveBeenCalledWith([{type: 'edit', patches: [{set: {name: 'y'}}]}], {
      transactionId: 'txn-caller',
    })
    expect(state.get().queued).toEqual([])
    expect(result).toMatchObject({
      transactionId: 'txn-caller',
      previous: {'drafts.doc1': {_rev: 'txn0'}},
      documents: {'drafts.doc1': {_rev: 'txn-caller'}},
      updated: ['drafts.doc1'],
    })
    // Resolves once the server accepts the transaction (`emitAccepted` settles it).
    const submitted = result.submitted()
    state.get().engineTransactions.get('txn-caller')?.settle({})
    await expect(submitted).resolves.toEqual({transactionId: 'txn-caller'})
  })

  it('rejects submitted() for an engine transaction that is reverted', async () => {
    engineServes()
    const result = await applyDocumentActions(instance, {
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'author',
          patches: [{set: {name: 'y'}}],
        },
      ],
      transactionId: 'txn-caller',
    })
    const submitted = result.submitted()
    state
      .get()
      .engineTransactions.get('txn-caller')
      ?.settle({error: new Error('discarded')})
    await expect(submitted).rejects.toThrow('discarded')
  })

  it('records the engine transaction as its own, so its echo is labelled local', async () => {
    engineServes()
    await applyDocumentActions(instance, {
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'author',
          patches: [{set: {name: 'y'}}],
        },
      ],
      transactionId: 'txn-caller',
    })
    expect(state.get().documentStates['drafts.doc1']?.recentOwnTransactionIds).toEqual([
      'txn-caller',
    ])
  })

  it('emits an error event and rejects when the engine path rejects an action', async () => {
    engineServes()
    const events: DocumentEvent[] = []
    eventsSubject.subscribe((event) => events.push(event))
    await expect(
      applyDocumentActions(instance, {
        actions: [{type: 'document.create', documentId: 'doc1', documentType: 'author'}],
        transactionId: 'txn-caller',
      }),
    ).rejects.toThrow(/already exists/)
    expect(events).toMatchObject([{type: 'error', documentId: 'doc1', transactionId: 'txn-caller'}])
  })
})
