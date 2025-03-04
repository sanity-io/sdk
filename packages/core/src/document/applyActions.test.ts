// applyActions.test.ts
import {type SanityDocument} from '@sanity/types'
import {Subject} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {type ActionContext} from '../resources/createAction'
import {createResourceState} from '../resources/createResource'
import {type DocumentAction} from './actions'
import {applyActions} from './applyActions'
import {type DocumentStoreState} from './documentStore'
import {type DocumentEvent} from './events'
import {type AppliedTransaction, type OutgoingTransaction} from './reducers'

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

describe('applyActions', () => {
  it('resolves with a successful applied transaction and accepted event', async () => {
    const eventsSubject = new Subject<DocumentEvent>()
    const initialState: TestState = {
      documentStates: {},
      queued: [],
      applied: [],
      outgoing: undefined,
      error: undefined,
      events: eventsSubject,
    }
    const state = createResourceState(initialState)
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
    })
    const context: ActionContext<TestState> = {instance, state}

    const action: DocumentAction = {
      type: 'document.edit',
      documentId: 'doc1',
      patches: [{set: {foo: 'bar'}}],
    }

    // Call applyActions with a fixed transactionId for reproducibility.
    const applyPromise = applyActions(context as ActionContext<DocumentStoreState>, action, {
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

    // Await the resolution of applyActions. This should pick up the applied transaction.
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
    const eventsSubject = new Subject<DocumentEvent>()
    const initialState: TestState = {
      documentStates: {},
      queued: [],
      applied: [],
      outgoing: undefined,
      error: undefined,
      events: eventsSubject,
    }
    const state = createResourceState(initialState)
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
    })
    const context: ActionContext<TestState> = {instance, state}

    const action: DocumentAction = {
      type: 'document.edit',
      documentId: 'doc1',
      patches: [{set: {foo: 'error'}}],
    }

    // Call applyActions with a fixed transactionId.
    const applyPromise = applyActions(context as ActionContext<DocumentStoreState>, action, {
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
})
