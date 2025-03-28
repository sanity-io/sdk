import {type SanityDocument} from '@sanity/types'
import {parse} from 'groq-js'
import {Subject} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {getDraftId, getPublishedId} from '../utils/ids'
import {type DocumentEvent} from './events'
import {type RemoteDocument} from './listen'
import {type DocumentSet} from './processMutations'
import {
  addSubscriptionIdToDocument,
  type AppliedTransaction,
  applyFirstQueuedTransaction,
  applyRemoteDocument,
  batchAppliedTransactions,
  cleanupOutgoingTransaction,
  type QueuedTransaction,
  queueTransaction,
  removeQueuedTransaction,
  removeSubscriptionIdFromDocument,
  revertOutgoingTransaction,
  type SyncTransactionState,
  transitionAppliedTransactionsToOutgoing,
} from './reducers'

const grants = {
  create: parse('true'),
  update: parse('true'),
  read: parse('true'),
  history: parse('true'),
}

const exampleDoc: SanityDocument = {
  _createdAt: new Date().toISOString(),
  _updatedAt: new Date().toISOString(),
  _type: 'author',
  _id: 'doc1',
  _rev: 'txn0',
}

describe('queueTransaction', () => {
  it('adds the transaction to queued and adds subscription ids to each document state', () => {
    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {},
    }

    const transaction: QueuedTransaction = {
      transactionId: 'txn1',
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'book',
          patches: [{set: {foo: 'bar'}}],
        },
      ],
    }

    const newState = queueTransaction(initialState, transaction)

    expect(newState.queued).toHaveLength(1)
    expect(newState.queued[0]).toEqual(transaction)

    // Check that both the published and draft documentStates got a subscription id added.
    const draftId = getDraftId('doc1')
    const pubId = getPublishedId('doc1')
    expect(newState.documentStates[draftId]).toBeDefined()
    expect(newState.documentStates[pubId]).toBeDefined()
    expect(newState.documentStates[draftId]?.subscriptions).toContain('txn1')
    expect(newState.documentStates[pubId]?.subscriptions).toContain('txn1')
  })
})

describe('removeQueuedTransaction', () => {
  it('removes the transaction from queued and removes subscription ids from documents', () => {
    const draftId = getDraftId('doc1')
    const pubId = getPublishedId('doc1')

    const initialState: SyncTransactionState = {
      queued: [
        {
          transactionId: 'txn1',
          actions: [
            {
              type: 'document.edit',
              documentId: 'doc1',
              documentType: 'book',
              patches: [{set: {foo: 'bar'}}],
            },
          ],
        },
      ],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [draftId]: {id: draftId, subscriptions: ['txn1'], local: {}},
        [pubId]: {id: pubId, subscriptions: ['txn1'], local: {}},
      } as SyncTransactionState['documentStates'],
    }

    const newState = removeQueuedTransaction(initialState, 'txn1')
    expect(newState.queued).toHaveLength(0)
    // Because removing the only subscription causes the document state to be omitted
    expect(newState.documentStates[draftId]).toBeUndefined()
    expect(newState.documentStates[pubId]).toBeUndefined()
  })

  it('returns the same state if the transaction is not found', () => {
    const state: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {},
    }
    const newState = removeQueuedTransaction(state, 'nonexistent')
    expect(newState).toEqual(state)
  })
})

describe('applyFirstQueuedTransaction', () => {
  it('returns unchanged state if no queued transaction exists', () => {
    const state: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {},
    }
    const newState = applyFirstQueuedTransaction(state)
    expect(newState).toEqual(state)
  })

  it('returns unchanged state if any required document is not yet loaded', () => {
    // If a document's local value is undefined, the reducer should do nothing.
    const draftId = getDraftId('doc1')
    const state: SyncTransactionState = {
      queued: [
        {
          transactionId: 'txn2',
          actions: [{type: 'document.discard', documentId: 'doc1', documentType: 'book'}],
        },
      ],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [draftId]: {id: draftId, subscriptions: ['txn2'], local: undefined},
      },
    }
    const newState = applyFirstQueuedTransaction(state)
    expect(newState).toEqual(state)
  })

  it('returns unchanged state if grants are missing', () => {
    const state: SyncTransactionState = {
      queued: [
        {
          transactionId: 'txn-missing-grants',
          actions: [{type: 'document.discard', documentId: 'doc1', documentType: 'book'}],
        },
      ],
      applied: [],
      outgoing: undefined,
      // No grants provided.
      documentStates: {},
    }
    const newState = applyFirstQueuedTransaction(state)
    expect(newState).toEqual(state)
  })

  it('applies the first queued transaction (using a discard action)', () => {
    // For a discard action, processActions deletes the draft document.
    const draftId = getDraftId('doc1')
    const pubId = getPublishedId('doc1')
    const initialDraft = {...exampleDoc, _id: draftId, foo: 'bar', _rev: 'rev1'}
    const initialPub = {...exampleDoc, _id: pubId, foo: 'bar', _rev: 'rev1'}

    const state: SyncTransactionState = {
      queued: [
        {
          transactionId: 'txn3',
          actions: [{type: 'document.discard', documentId: 'doc1', documentType: 'book'}],
        },
      ],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [draftId]: {id: draftId, subscriptions: ['txn3'], local: initialDraft},
        [pubId]: {id: pubId, subscriptions: ['txn3'], local: initialPub},
      } as SyncTransactionState['documentStates'],
    }

    const newState = applyFirstQueuedTransaction(state)
    // The queued array should now be empty.
    expect(newState.queued).toHaveLength(0)
    // One applied transaction should have been added.
    expect(newState.applied).toHaveLength(1)
    // For a discard action, the draft's local value becomes null.
    expect(newState.documentStates[draftId]?.local).toBeNull()
    // The published version remains unchanged.
    expect(newState.documentStates[pubId]?.local).toEqual(initialPub)
  })
})

describe('batchAppliedTransactions', () => {
  it('returns undefined if no applied transactions are provided', () => {
    const result = batchAppliedTransactions([])
    expect(result).toBeUndefined()
  })

  it('returns the transaction with batching disabled if it has > 1 action', () => {
    const appliedTx: AppliedTransaction = {
      transactionId: 'txn4',
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'book',
          patches: [{set: {foo: 'a'}}],
        },
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'book',
          patches: [{set: {bar: 'b'}}],
        },
      ],
      disableBatching: false,
      outgoingActions: [],
      outgoingMutations: [],
      base: {[getDraftId('doc1')]: {_id: getDraftId('doc1'), _rev: 'rev1'}} as DocumentSet,
      working: {
        [getDraftId('doc1')]: {
          ...exampleDoc,
          _id: getDraftId('doc1'),
          _rev: 'rev2',
          foo: 'a',
          bar: 'b',
        },
      },
      previous: {[getDraftId('doc1')]: {...exampleDoc, _id: getDraftId('doc1'), _rev: 'rev1'}},
      previousRevs: {[getDraftId('doc1')]: 'rev1'},
      timestamp: '2025-02-06T00:00:00.000Z',
    }
    const result = batchAppliedTransactions([appliedTx])
    expect(result).toBeDefined()
    expect(result?.disableBatching).toBe(true)
    expect(result?.batchedTransactionIds).toEqual(['txn4'])
  })

  it('batches two edit transactions when possible', () => {
    const draftId = getDraftId('doc1')
    const appliedTx1: AppliedTransaction = {
      transactionId: 'txn5',
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'book',
          patches: [{set: {foo: 'a'}}],
        },
      ],
      disableBatching: false,
      outgoingActions: [
        {
          actionType: 'sanity.action.document.edit',
          draftId,
          publishedId: getPublishedId('doc1'),
          patch: {set: {foo: 'a'}},
        },
      ],
      outgoingMutations: [],
      base: {[draftId]: {...exampleDoc, _id: draftId, _rev: 'rev1'}},
      working: {[draftId]: {...exampleDoc, _id: draftId, _rev: 'rev2', foo: 'a'}},
      previous: {[draftId]: {...exampleDoc, _id: draftId, _rev: 'rev1'}},
      previousRevs: {[draftId]: 'rev1'},
      timestamp: '2025-02-06T00:00:00.000Z',
    }
    const appliedTx2: AppliedTransaction = {
      transactionId: 'txn6',
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'book',
          patches: [{set: {bar: 'b'}}],
        },
      ],
      disableBatching: false,
      outgoingActions: [
        {
          actionType: 'sanity.action.document.edit',
          draftId,
          publishedId: getPublishedId('doc1'),
          patch: {set: {bar: 'b'}},
        },
      ],
      outgoingMutations: [],
      base: {[draftId]: {...exampleDoc, _id: draftId, _rev: 'rev2'}},
      working: {[draftId]: {...exampleDoc, _id: draftId, _rev: 'rev3', foo: 'a', bar: 'b'}},
      previous: {[draftId]: {...exampleDoc, _id: draftId, _rev: 'rev2'}},
      previousRevs: {[draftId]: 'rev2'},
      timestamp: '2025-02-06T00:01:00.000Z',
    }
    const batched = batchAppliedTransactions([appliedTx1, appliedTx2])
    expect(batched).toBeDefined()
    expect(batched?.disableBatching).toBe(false)
    expect(batched?.batchedTransactionIds).toEqual(['txn5', 'txn6'])
    expect(batched?.actions).toEqual([appliedTx1.actions[0], appliedTx2.actions[0]])
    // Outgoing actions are concatenated.
    expect(batched?.outgoingActions).toEqual([
      ...appliedTx1.outgoingActions,
      ...appliedTx2.outgoingActions,
    ])
  })

  it('returns a transaction with disableBatching true if a single edit action already has disableBatching set', () => {
    const draftId = getDraftId('docA')
    const appliedTx: AppliedTransaction = {
      transactionId: 'txn-disable',
      actions: [
        {
          type: 'document.edit',
          documentId: 'docA',
          documentType: 'book',
          patches: [{set: {foo: 'a'}}],
        },
      ],
      disableBatching: true, // already set to true
      outgoingActions: [],
      outgoingMutations: [],
      base: {[draftId]: {...exampleDoc, _id: draftId, _rev: 'rev1'}},
      working: {[draftId]: {...exampleDoc, _id: draftId, foo: 'a', _rev: 'rev2'}},
      previous: {[draftId]: {...exampleDoc, _id: draftId, _rev: 'rev1'}},
      previousRevs: {[draftId]: 'rev1'},
      timestamp: '2025-02-06T00:00:00.000Z',
    }

    const result = batchAppliedTransactions([appliedTx])
    expect(result).toBeDefined()
    expect(result?.disableBatching).toBe(true)
    expect(result?.batchedTransactionIds).toEqual(['txn-disable'])
    // The actions array should be the same as the input's.
    expect(result?.actions).toEqual(appliedTx.actions)
  })
})

describe('transitionAppliedTransactionsToOutgoing', () => {
  it('returns the same state if an outgoing transaction already exists', () => {
    const state: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: {transactionId: 'txnOut'} as SyncTransactionState['outgoing'],
      grants,
      documentStates: {},
    }
    const newState = transitionAppliedTransactionsToOutgoing(state)
    expect(newState).toEqual(state)
  })

  it('transitions applied transactions to an outgoing transaction', () => {
    const draftId = getDraftId('doc1')
    const initialDoc = {...exampleDoc, _id: draftId, foo: 'old', _rev: 'rev1'}
    const state: SyncTransactionState = {
      queued: [],
      applied: [
        {
          transactionId: 'txn7',
          actions: [
            {
              type: 'document.edit',
              documentId: 'doc1',
              documentType: 'book',
              patches: [{set: {foo: 'new'}}],
            },
          ],
          disableBatching: false,
          outgoingActions: [],
          outgoingMutations: [],
          base: {[draftId]: initialDoc},
          working: {[draftId]: {...exampleDoc, _id: draftId, foo: 'new', _rev: 'rev2'}},
          previous: {[draftId]: initialDoc},
          previousRevs: {[draftId]: 'rev1'},
          timestamp: '2025-02-06T00:02:00.000Z',
        },
      ],
      outgoing: undefined,
      grants,
      documentStates: {
        [draftId]: {
          ...exampleDoc,
          id: draftId,
          subscriptions: ['sub1'],
          local: {...exampleDoc, _id: draftId, foo: 'new', _rev: 'rev2'},
        },
      },
    }
    const newState = transitionAppliedTransactionsToOutgoing(state)
    expect(newState.outgoing).toBeDefined()
    expect(newState.applied).toHaveLength(0)
    const docState = newState.documentStates[draftId]
    expect(docState?.unverifiedRevisions).toBeDefined()
    expect(docState?.unverifiedRevisions?.['txn7']).toBeDefined()
    expect(docState?.unverifiedRevisions?.['txn7']?.previousRev).toEqual('rev1')
  })
})

describe('cleanupOutgoingTransaction', () => {
  it('returns unchanged state if there is no outgoing transaction', () => {
    const state: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {},
    }
    const newState = cleanupOutgoingTransaction(state)
    expect(newState).toEqual(state)
  })

  it('removes subscription ids for all documents associated with the outgoing transaction and then clears outgoing', () => {
    const draftId = getDraftId('doc1')
    const pubId = getPublishedId('doc1')
    const state: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: {
        transactionId: 'txn8',
        actions: [
          {
            type: 'document.edit',
            documentId: 'doc1',
            documentType: 'book',
            patches: [{set: {foo: 'x'}}],
          },
        ],
        disableBatching: false,
        batchedTransactionIds: ['txn8'],
        outgoingActions: [],
        outgoingMutations: [],
        base: {},
        working: {},
        previous: {},
        previousRevs: {},
        timestamp: '2025-02-06T00:03:00.000Z',
      },
      grants,
      documentStates: {
        [draftId]: {...exampleDoc, id: draftId, subscriptions: ['txn8'], local: null},
        [pubId]: {...exampleDoc, id: pubId, subscriptions: ['txn8'], local: null},
      },
    }
    const newState = cleanupOutgoingTransaction(state)
    expect(newState.outgoing).toBeUndefined()
    // Since the only subscription was removed, the document states should be omitted.
    expect(newState.documentStates[draftId]).toBeUndefined()
    expect(newState.documentStates[pubId]).toBeUndefined()
  })
})

describe('revertOutgoingTransaction', () => {
  it('reverts the outgoing transaction and updates documentStates by removing unverified revisions', () => {
    const draftId = getDraftId('doc1')
    const pubId = getPublishedId('doc1')
    // In this test we simulate a state with one applied transaction and an outgoing transaction.
    const state: SyncTransactionState = {
      queued: [],
      applied: [
        {
          transactionId: 'txn9',
          actions: [
            {
              type: 'document.edit',
              documentId: 'doc1',
              documentType: 'book',
              patches: [{set: {foo: 'reverted'}}],
            },
          ],
          disableBatching: false,
          outgoingActions: [],
          outgoingMutations: [],
          base: {[draftId]: {...exampleDoc, _id: draftId, foo: 'old', _rev: 'rev1'}},
          working: {[draftId]: {...exampleDoc, _id: draftId, foo: 'changed', _rev: 'rev2'}},
          previous: {[draftId]: {...exampleDoc, _id: draftId, foo: 'old', _rev: 'rev1'}},
          previousRevs: {[draftId]: 'rev1'},
          timestamp: '2025-02-06T00:04:00.000Z',
        },
      ],
      outgoing: {
        transactionId: 'txnOut',
        actions: [
          {
            type: 'document.edit',
            documentId: 'doc1',
            documentType: 'book',
            patches: [{set: {foo: 'changed'}}],
          },
        ],
        disableBatching: false,
        batchedTransactionIds: ['txnOut'],
        outgoingActions: [],
        outgoingMutations: [],
        base: {},
        working: {},
        previous: {},
        previousRevs: {},
        timestamp: '2025-02-06T00:04:30.000Z',
      },
      grants,
      documentStates: {
        [draftId]: {
          id: draftId,
          subscriptions: ['sub1'],
          local: {...exampleDoc, _id: draftId, foo: 'changed', _rev: 'rev2'},
          remote: {...exampleDoc, _id: draftId, foo: 'old', _rev: 'rev1'},
          unverifiedRevisions: {
            txnOut: {
              transactionId: 'txnOut',
              documentId: draftId,
              previousRev: 'rev1',
              timestamp: '2025-02-06T00:04:30.000Z',
            },
          },
        },
        [pubId]: {
          id: pubId,
          subscriptions: ['sub1'],
          local: {...exampleDoc, _id: pubId, foo: 'pub', _rev: 'revPub'},
        },
      },
    }
    const newState = revertOutgoingTransaction(state)
    expect(newState.outgoing).toBeUndefined()
    const docState = newState.documentStates[draftId]
    expect(docState?.unverifiedRevisions && docState.unverifiedRevisions['txnOut']).toBeUndefined()
  })
})

describe('applyRemoteDocument', () => {
  it('does nothing if there is no document state for the given documentId', () => {
    const state: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {},
    }
    const remote: RemoteDocument = {
      type: 'sync',
      documentId: 'docX',
      document: {...exampleDoc, _id: 'docX', foo: 'remote'},
      revision: 'revRemote',
      timestamp: '2025-02-06T00:05:00.000Z',
    }
    const events = new Subject<DocumentEvent>()
    const newState = applyRemoteDocument(state, remote, events)
    expect(newState).toEqual(state)
  })

  it('verifies an unverified revision when the revision matches and previousRev is as expected', () => {
    const docId = getDraftId('doc1')
    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [docId]: {
          id: docId,
          subscriptions: ['sub1'],
          local: {...exampleDoc, _id: docId, foo: 'old'},
          remote: {...exampleDoc, _id: docId, foo: 'old'},
          unverifiedRevisions: {
            txn10: {
              transactionId: 'txn10',
              documentId: docId,
              previousRev: 'revOld',
              timestamp: '2025-02-06T00:06:00.000Z',
            },
          },
        },
      },
    }
    const remote: RemoteDocument = {
      type: 'sync',
      documentId: docId,
      document: {...exampleDoc, _id: docId, foo: 'new'},
      revision: 'txn10',
      previousRev: 'revOld',
      timestamp: '2025-02-06T00:07:00.000Z',
    }
    const events = new Subject<DocumentEvent>()
    const newState = applyRemoteDocument(initialState, remote, events)
    const newDocState = newState.documentStates[docId]
    expect(newDocState?.remote).toEqual(remote.document)
    expect(newDocState?.remoteRev).toEqual(remote.revision)
    // The matching unverified revision should be removed.
    expect(newDocState?.unverifiedRevisions?.['txn10']).toBeUndefined()
  })

  it('rebases local changes when no matching unverified revision is found', () => {
    // In this branch we simply let processActions rebase so that the local becomes the remote.
    const docId = getDraftId('doc1')
    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [docId]: {
          id: docId,
          subscriptions: ['sub1'],
          local: {...exampleDoc, _id: docId, foo: 'local'},
          remote: {...exampleDoc, _id: docId, foo: 'old'},
          unverifiedRevisions: {},
        },
      },
    }
    const remote: RemoteDocument = {
      type: 'sync',
      documentId: docId,
      document: {...exampleDoc, _id: docId, foo: 'remote'},
      revision: 'txn11',
      previousRev: 'revMismatch',
      timestamp: '2025-02-06T00:08:00.000Z',
    }
    const events = new Subject<DocumentEvent>()
    const newState = applyRemoteDocument(initialState, remote, events)
    const newDocState = newState.documentStates[docId]
    expect(newDocState?.remote).toEqual(remote.document)
    expect(newDocState?.remoteRev).toEqual(remote.revision)
    // For this simple test we expect that the local is “rebased” to the remote document.
    expect(newDocState?.local).toEqual(remote.document)
  })

  // Test that a sync event removes outdated unverified revisions.
  it('removes outdated unverified revisions when a sync event is received', () => {
    const docId = getDraftId('doc1')
    // An unverified revision created at an earlier time.
    const outdatedTimestamp = new Date('2025-02-06T00:09:00.000Z').toISOString()
    // The incoming sync event timestamp is later.
    const syncTimestamp = new Date('2025-02-06T00:10:00.000Z').toISOString()
    const futureTimestamp = new Date('2025-02-06T00:11:00.000Z').toISOString()

    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [docId]: {
          id: docId,
          subscriptions: ['sub-sync'],
          local: {...exampleDoc, _id: docId, foo: 'local'},
          remote: {...exampleDoc, _id: docId, foo: 'old'},
          // The unverified revisions from previous transactions.
          unverifiedRevisions: {
            txn12: {
              transactionId: 'txn12',
              documentId: docId,
              previousRev: 'revOld',
              timestamp: outdatedTimestamp,
            },
            txn13: {
              transactionId: 'txn13',
              documentId: docId,
              previousRev: 'anotherRev',
              timestamp: futureTimestamp,
            },
          },
        },
      },
    }

    const remote: RemoteDocument = {
      type: 'sync',
      documentId: docId,
      document: {...exampleDoc, _id: docId, foo: 'remote-sync'},
      revision: 'currentRev',
      timestamp: syncTimestamp,
      previousRev: undefined,
    }

    // Create a dummy events subject.
    const events = new Subject<DocumentEvent>()

    const newState = applyRemoteDocument(initialState, remote, events)
    const newDocState = newState.documentStates[docId]

    // Expect that all outdated unverified revisions are removed.
    expect(newDocState?.unverifiedRevisions).toEqual({
      txn13: {
        documentId: docId,
        previousRev: 'anotherRev',
        timestamp: futureTimestamp,
        transactionId: 'txn13',
      },
    })
    expect(newDocState?.remote).toEqual(remote.document)
    expect(newDocState?.remoteRev).toBe('currentRev')
  })
})

describe('addSubscriptionIdToDocument', () => {
  it('adds a subscription id to an existing document state', () => {
    const docId = 'doc2'
    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [docId]: {...exampleDoc, id: docId, subscriptions: ['subA']},
      },
    }
    const newState = addSubscriptionIdToDocument(initialState, docId, 'subB')
    expect(newState.documentStates[docId]?.subscriptions).toContain('subA')
    expect(newState.documentStates[docId]?.subscriptions).toContain('subB')
  })

  it('creates a new document state if one does not exist', () => {
    const docId = 'doc3'
    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {},
    }
    const newState = addSubscriptionIdToDocument(initialState, docId, 'subC')
    expect(newState.documentStates[docId]).toBeDefined()
    expect(newState.documentStates[docId]?.subscriptions).toContain('subC')
  })
})

describe('removeSubscriptionIdFromDocument', () => {
  it('removes a subscription id but leaves the document state if other subscriptions remain', () => {
    const docId = 'doc4'
    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [docId]: {id: docId, subscriptions: ['subD', 'subE']},
      },
    }
    const newState = removeSubscriptionIdFromDocument(initialState, docId, 'subD')
    expect(newState.documentStates[docId]?.subscriptions).not.toContain('subD')
    expect(newState.documentStates[docId]?.subscriptions).toContain('subE')
  })

  it('removes the document state entirely if no subscriptions remain', () => {
    const docId = 'doc5'
    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {
        [docId]: {id: docId, subscriptions: ['subF']},
      },
    }
    const newState = removeSubscriptionIdFromDocument(initialState, docId, 'subF')
    expect(newState.documentStates[docId]).toBeUndefined()
  })

  it('returns the same state if the document state does not exist', () => {
    const initialState: SyncTransactionState = {
      queued: [],
      applied: [],
      outgoing: undefined,
      grants,
      documentStates: {},
    }
    const newState = removeSubscriptionIdFromDocument(initialState, 'nonexistent', 'subX')
    expect(newState).toEqual(initialState)
  })
})
