// applyDocumentActions.test.ts
import {type SanityDocument} from '@sanity/types'
import {Subject} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {bindActionByDataset} from '../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {} from '../store/createStateSourceAction'
import {createStoreState, type StoreState} from '../store/createStoreState'
import {type DocumentAction} from './actions'
import {type DocumentStoreState} from './documentStore'
import {type DocumentEvent} from './events'
import {type AppliedTransaction, type OutgoingTransaction} from './reducers'

vi.mock('../store/createActionBinder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store/createActionBinder')>()),
  bindActionByDataset: vi.fn(),
}))

type TestState = Pick<
  DocumentStoreState,
  'documentStates' | 'queued' | 'applied' | 'outgoing' | 'error' | 'events'
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
    }
    state = createStoreState(initialState)
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    vi.mocked(bindActionByDataset).mockImplementation(
      (_storeDef, action) =>
        (instanceParam: SanityInstance, ...params: unknown[]) =>
          action({instance: instanceParam, state}, ...params),
    )
    // Import dynamically to ensure mocks are set up before the module under test is loaded
    const module = await import('./applyDocumentActions')
    applyDocumentActions = module.applyDocumentActions
  })

  afterEach(() => {
    instance.dispose()
  })

  it('resolves with a successful applied transaction and accepted event', async () => {
    const action: DocumentAction = {
      type: 'document.edit',
      documentId: 'doc1',
      documentType: 'example',
      patches: [{set: {foo: 'bar'}}],
    }

    // Call applyDocumentActions with a fixed transactionId for reproducibility.
    const applyPromise = applyDocumentActions(instance, action, {
      transactionId: 'txn-success',
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
    const applyPromise = applyDocumentActions(instance, action, {
      transactionId: 'txn-error',
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

  it('matches parent instance via child when action projectId and dataset do not match child config', async () => {
    // Create a parent instance
    const parentInstance = createSanityInstance({projectId: 'p', dataset: 'd'})
    // Create a child instance with different config
    const childInstance = parentInstance.createChild({projectId: 'child-p', dataset: 'child-d'})
    // Use the child instance in context
    // Create an action that refers to the parent's configuration
    const action: DocumentAction = {
      type: 'document.edit',
      documentId: 'doc1',
      documentType: 'example',
      patches: [{set: {foo: 'childTest'}}],
      projectId: 'p',
      dataset: 'd',
    }
    // Call applyDocumentActions with the context using childInstance, but with action requiring parent's config
    const applyPromise = applyDocumentActions(childInstance, action, {
      transactionId: 'txn-child-match',
    })

    // Simulate an applied transaction on the parent's instance
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

    childInstance.dispose()
    parentInstance.dispose()
  })
})
