import {DocumentId, getDraftId, getPublishedId} from '@sanity/id-utils'
import {type SanityDocument} from '@sanity/types'
import {parse} from 'groq-js'
import {Subject} from 'rxjs'
import {describe, expect, it} from 'vitest'

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
    const draftId = getDraftId(DocumentId('doc1'))
    const pubId = getPublishedId(DocumentId('doc1'))
    expect(newState.documentStates[draftId]).toBeDefined()
    expect(newState.documentStates[pubId]).toBeDefined()
    expect(newState.documentStates[draftId]?.subscriptions).toContain('txn1')
    expect(newState.documentStates[pubId]?.subscriptions).toContain('txn1')
  })
})

describe('removeQueuedTransaction', () => {
  it('removes the transaction from queued and removes subscription ids from documents', () => {
    const draftId = getDraftId(DocumentId('doc1'))
    const pubId = getPublishedId(DocumentId('doc1'))

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
        [draftId]: {id: draftId, subscriptions: ['txn1']},
        [pubId]: {id: pubId, subscriptions: ['txn1']},
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
    const draftId = getDraftId(DocumentId('doc1'))
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
    const draftId = getDraftId(DocumentId('doc1'))
    const pubId = getPublishedId(DocumentId('doc1'))
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
      base: {
        [getDraftId(DocumentId('doc1'))]: {_id: getDraftId(DocumentId('doc1')), _rev: 'rev1'},
      } as unknown as DocumentSet,
      working: {
        [getDraftId(DocumentId('doc1'))]: {
          ...exampleDoc,
          _id: getDraftId(DocumentId('doc1')),
          _rev: 'rev2',
          foo: 'a',
          bar: 'b',
        },
      },
      previous: {
        [getDraftId(DocumentId('doc1'))]: {
          ...exampleDoc,
          _id: getDraftId(DocumentId('doc1')),
          _rev: 'rev1',
        },
      },
      previousRevs: {[getDraftId(DocumentId('doc1'))]: 'rev1'},
      timestamp: '2025-02-06T00:00:00.000Z',
    }
    const result = batchAppliedTransactions([appliedTx])
    expect(result).toBeDefined()
    expect(result?.disableBatching).toBe(true)
    expect(result?.batchedTransactionIds).toEqual(['txn4'])
  })

  it('batches two edit transactions when possible', () => {
    const documentId = DocumentId('doc1')
    const draftId = getDraftId(documentId)
    const appliedTx1: AppliedTransaction = {
      transactionId: 'txn5',
      actions: [
        {
          type: 'document.edit',
          documentId,
          documentType: 'book',
          patches: [{set: {foo: 'a'}}],
        },
      ],
      disableBatching: false,
      outgoingActions: [
        {
          actionType: 'sanity.action.document.edit',
          draftId,
          publishedId: getPublishedId(documentId),
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
          documentId,
          documentType: 'book',
          patches: [{set: {bar: 'b'}}],
        },
      ],
      disableBatching: false,
      outgoingActions: [
        {
          actionType: 'sanity.action.document.edit',
          draftId,
          publishedId: getPublishedId(documentId),
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
    const draftId = getDraftId(DocumentId('docA'))
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

  it('does not batch a liveEdit edit with a non-liveEdit edit', () => {
    const nonLiveEditTx: AppliedTransaction = {
      transactionId: 'txn-nonlive',
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc1',
          documentType: 'article',
          patches: [{set: {foo: 'a'}}],
        },
      ],
      disableBatching: false,
      outgoingActions: [
        {
          actionType: 'sanity.action.document.edit',
          draftId: getDraftId(DocumentId('doc1')),
          publishedId: getPublishedId(DocumentId('doc1')),
          patch: {set: {foo: 'a'}},
        },
      ],
      outgoingMutations: [],
      base: {
        [getDraftId(DocumentId('doc1'))]: {
          ...exampleDoc,
          _id: getDraftId(DocumentId('doc1')),
          _rev: 'rev1',
        },
      },
      working: {
        [getDraftId(DocumentId('doc1'))]: {
          ...exampleDoc,
          _id: getDraftId(DocumentId('doc1')),
          _rev: 'rev2',
        },
      },
      previous: {
        [getDraftId(DocumentId('doc1'))]: {
          ...exampleDoc,
          _id: getDraftId(DocumentId('doc1')),
          _rev: 'rev1',
        },
      },
      previousRevs: {[getDraftId(DocumentId('doc1'))]: 'rev1'},
      timestamp: '2025-02-06T00:00:00.000Z',
    }
    const liveEditTx: AppliedTransaction = {
      transactionId: 'txn-live',
      actions: [
        {
          type: 'document.edit',
          documentId: 'doc2',
          documentType: 'liveArticle',
          liveEdit: true,
          patches: [{set: {bar: 'b'}}],
        },
      ],
      disableBatching: false,
      outgoingActions: [],
      outgoingMutations: [{patch: {id: 'doc2', set: {bar: 'b'}}}],
      base: {doc2: {...exampleDoc, _id: 'doc2', _rev: 'rev1'}},
      working: {doc2: {...exampleDoc, _id: 'doc2', _rev: 'rev2'}},
      previous: {doc2: {...exampleDoc, _id: 'doc2', _rev: 'rev1'}},
      previousRevs: {doc2: 'rev1'},
      timestamp: '2025-02-06T00:01:00.000Z',
    }

    // liveEdit first: should return only the liveEdit transaction
    const resultLiveFirst = batchAppliedTransactions([liveEditTx, nonLiveEditTx])
    expect(resultLiveFirst?.batchedTransactionIds).toEqual(['txn-live'])
    expect(resultLiveFirst?.outgoingMutations).toEqual(liveEditTx.outgoingMutations)
    expect(resultLiveFirst?.outgoingActions).toHaveLength(0)

    // non-liveEdit first: should return only the non-liveEdit transaction
    const resultNonLiveFirst = batchAppliedTransactions([nonLiveEditTx, liveEditTx])
    expect(resultNonLiveFirst?.batchedTransactionIds).toEqual(['txn-nonlive'])
    expect(resultNonLiveFirst?.outgoingActions).toEqual(nonLiveEditTx.outgoingActions)
    expect(resultNonLiveFirst?.outgoingMutations).toHaveLength(0)
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
    const draftId = getDraftId(DocumentId('doc1'))
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
    // the transaction ID is also tracked durably for remote-patches origin
    // labeling, surviving unverified-revision pruning
    expect(docState?.recentOwnTransactionIds).toEqual(['txn7'])
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
    const draftId = getDraftId(DocumentId('doc1'))
    const pubId = getPublishedId(DocumentId('doc1'))
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
    const draftId = getDraftId(DocumentId('doc1'))
    const pubId = getPublishedId(DocumentId('doc1'))
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
    const docId = getDraftId(DocumentId('doc1'))
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

  describe('fast-forward convergence of local', () => {
    const docId = getDraftId(DocumentId('doc1'))
    const otherDocId = getDraftId(DocumentId('doc2'))

    const makeApplied = (overrides: Partial<AppliedTransaction>): AppliedTransaction => ({
      transactionId: 'txnPending',
      actions: [],
      working: {},
      previous: {},
      base: {},
      previousRevs: {},
      timestamp: '2025-02-06T00:06:30.000Z',
      outgoingActions: [],
      outgoingMutations: [],
      ...overrides,
    })

    const makeState = (applied: AppliedTransaction[]): SyncTransactionState => ({
      queued: [],
      applied,
      outgoing: undefined,
      grants,
      documentStates: {
        [docId]: {
          id: docId,
          subscriptions: ['sub1'],
          local: {...exampleDoc, _id: docId, foo: 'optimistic'},
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
    })

    const remote: RemoteDocument = {
      type: 'sync',
      documentId: docId,
      document: {...exampleDoc, _id: docId, foo: 'server-truth'},
      revision: 'txn10',
      previousRev: 'revOld',
      timestamp: '2025-02-06T00:07:00.000Z',
    }

    it('converges local to the server document when nothing else is pending', () => {
      const events = new Subject<DocumentEvent>()
      const newState = applyRemoteDocument(makeState([]), remote, events)
      expect(newState.documentStates[docId]?.local).toEqual(remote.document)
    })

    it('converges local when pending work modifies only other documents', () => {
      // a pending applied transaction on doc2 must not block convergence of
      // doc1: nothing would ever revisit doc1's local otherwise
      const otherDoc = {...exampleDoc, _id: otherDocId}
      const pendingOnOtherDoc = makeApplied({
        working: {[otherDocId]: {...otherDoc, _rev: 'txnPending'}},
        previous: {[otherDocId]: otherDoc},
        base: {[otherDocId]: otherDoc},
        previousRevs: {[otherDocId]: 'txn0'},
      })
      const events = new Subject<DocumentEvent>()
      const newState = applyRemoteDocument(makeState([pendingOnOtherDoc]), remote, events)
      expect(newState.documentStates[docId]?.local).toEqual(remote.document)
    })

    it('converges local when pending work carries this document unmodified', () => {
      // a draft edit carries the published document in its working set
      // without changing it; presence alone must not block convergence
      const thisDoc = {...exampleDoc, _id: docId}
      const pendingCarryingUnmodified = makeApplied({
        working: {
          [docId]: thisDoc,
          [otherDocId]: {...exampleDoc, _id: otherDocId, _rev: 'txnPending'},
        },
        previous: {[docId]: thisDoc, [otherDocId]: {...exampleDoc, _id: otherDocId}},
        base: {[docId]: thisDoc, [otherDocId]: {...exampleDoc, _id: otherDocId}},
        previousRevs: {[docId]: thisDoc._rev, [otherDocId]: 'txn0'},
      })
      const events = new Subject<DocumentEvent>()
      const newState = applyRemoteDocument(makeState([pendingCarryingUnmodified]), remote, events)
      expect(newState.documentStates[docId]?.local).toEqual(remote.document)
    })

    it('keeps the optimistic local when pending work modifies this document', () => {
      const optimistic = {...exampleDoc, _id: docId, _rev: 'txnPending', foo: 'optimistic'}
      const pendingOnThisDoc = makeApplied({
        working: {[docId]: optimistic},
        previous: {[docId]: {...exampleDoc, _id: docId}},
        base: {[docId]: {...exampleDoc, _id: docId}},
        previousRevs: {[docId]: 'txn0'},
      })
      const state = makeState([pendingOnThisDoc])
      const events = new Subject<DocumentEvent>()
      const newState = applyRemoteDocument(state, remote, events)
      expect(newState.documentStates[docId]?.local).toBe(state.documentStates[docId]?.local)
      expect(newState.documentStates[docId]?.remote).toEqual(remote.document)
    })

    it('keeps the optimistic local when a different in-flight transaction modifies this document', () => {
      const optimistic = {...exampleDoc, _id: docId, _rev: 'txnOutgoing', foo: 'optimistic'}
      const outgoing = {
        ...makeApplied({
          transactionId: 'txnOutgoing',
          working: {[docId]: optimistic},
          previous: {[docId]: {...exampleDoc, _id: docId}},
          base: {[docId]: {...exampleDoc, _id: docId}},
          previousRevs: {[docId]: 'txn0'},
        }),
        disableBatching: false,
        batchedTransactionIds: ['txnOutgoing'],
      }
      const state = {...makeState([]), outgoing}
      const events = new Subject<DocumentEvent>()
      const newState = applyRemoteDocument(state, remote, events)
      expect(newState.documentStates[docId]?.local).toBe(state.documentStates[docId]?.local)
    })
  })

  it('rebases local changes when no matching unverified revision is found', () => {
    // In this branch we simply let processActions rebase so that the local becomes the remote.
    const docId = getDraftId(DocumentId('doc1'))
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
    const docId = getDraftId(DocumentId('doc1'))
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

  describe('remote-patches events', () => {
    const docId = getDraftId(DocumentId('doc1'))

    function createInitialState(
      unverifiedRevisions: NonNullable<
        SyncTransactionState['documentStates'][string]
      >['unverifiedRevisions'] = {},
      recentOwnTransactionIds?: string[],
    ): SyncTransactionState {
      return {
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
            unverifiedRevisions,
            ...(recentOwnTransactionIds && {recentOwnTransactionIds}),
          },
        },
      }
    }

    it('emits a remote-patches event with origin "remote" for foreign transactions', () => {
      const events = new Subject<DocumentEvent>()
      const received: DocumentEvent[] = []
      events.subscribe((e) => received.push(e))

      const remote: RemoteDocument = {
        type: 'mutation',
        documentId: docId,
        document: {...exampleDoc, _id: docId, foo: 'new'},
        revision: 'txnForeign',
        previousRev: 'txn0',
        timestamp: '2025-02-06T00:12:00.000Z',
        mutations: [
          {
            patch: {
              id: docId,
              unset: ['blocks[_key=="a"].children[_key=="b"].marks[0]'],
            },
          },
          {
            patch: {
              id: docId,
              insert: {after: 'blocks[_key=="a"].markDefs[-1]', items: [{_key: 'link1'}]},
            },
          },
        ],
      }

      applyRemoteDocument(createInitialState(), remote, events)

      expect(received).toEqual([
        {
          type: 'remote-patches',
          documentId: docId,
          transactionId: 'txnForeign',
          previousRev: 'txn0',
          timestamp: '2025-02-06T00:12:00.000Z',
          origin: 'remote',
          patches: [
            {unset: ['blocks[_key=="a"].children[_key=="b"].marks[0]']},
            {insert: {after: 'blocks[_key=="a"].markDefs[-1]', items: [{_key: 'link1'}]}},
          ],
        },
      ])
    })

    it('emits origin "local" when the transaction is one of our own unverified revisions', () => {
      const events = new Subject<DocumentEvent>()
      const received: DocumentEvent[] = []
      events.subscribe((e) => received.push(e))

      const remote: RemoteDocument = {
        type: 'mutation',
        documentId: docId,
        document: {...exampleDoc, _id: docId, foo: 'new'},
        revision: 'txnOwn',
        previousRev: 'txn0',
        timestamp: '2025-02-06T00:13:00.000Z',
        mutations: [{patch: {id: docId, set: {foo: 'new'}}}],
      }

      applyRemoteDocument(
        createInitialState({
          txnOwn: {
            transactionId: 'txnOwn',
            documentId: docId,
            previousRev: 'txn0',
            timestamp: '2025-02-06T00:13:00.000Z',
          },
        }),
        remote,
        events,
      )

      expect(received).toEqual([
        {
          type: 'remote-patches',
          documentId: docId,
          transactionId: 'txnOwn',
          previousRev: 'txn0',
          timestamp: '2025-02-06T00:13:00.000Z',
          origin: 'local',
          patches: [{set: {foo: 'new'}}],
        },
      ])
    })

    it('does not emit for sync events', () => {
      const events = new Subject<DocumentEvent>()
      const received: DocumentEvent[] = []
      events.subscribe((e) => received.push(e))

      const remote: RemoteDocument = {
        type: 'sync',
        documentId: docId,
        document: {...exampleDoc, _id: docId, foo: 'new'},
        revision: 'revSync',
        timestamp: '2025-02-06T00:14:00.000Z',
      }

      applyRemoteDocument(createInitialState(), remote, events)
      expect(received).toEqual([])
    })

    it('does not emit when the mutations contain no patches', () => {
      const events = new Subject<DocumentEvent>()
      const received: DocumentEvent[] = []
      events.subscribe((e) => received.push(e))

      const remote: RemoteDocument = {
        type: 'mutation',
        documentId: docId,
        document: {...exampleDoc, _id: docId, foo: 'new'},
        revision: 'txnCreate',
        previousRev: 'txn0',
        timestamp: '2025-02-06T00:15:00.000Z',
        mutations: [{createOrReplace: {...exampleDoc, _id: docId, foo: 'new'}}],
      }

      applyRemoteDocument(createInitialState(), remote, events)
      expect(received).toEqual([])
    })

    it('excludes patches addressed to other documents in the same transaction', () => {
      const events = new Subject<DocumentEvent>()
      const received: DocumentEvent[] = []
      events.subscribe((e) => received.push(e))

      const remote: RemoteDocument = {
        type: 'mutation',
        documentId: docId,
        document: {...exampleDoc, _id: docId, foo: 'new'},
        revision: 'txnMulti',
        previousRev: 'txn0',
        timestamp: '2025-02-06T00:20:00.000Z',
        mutations: [
          {patch: {id: docId, set: {foo: 'new'}}},
          {patch: {id: 'some-other-doc', set: {foo: 'other'}}},
          {patch: {query: '*[_type == "author"]', set: {foo: 'queried'}}},
        ],
      }

      applyRemoteDocument(createInitialState(), remote, events)

      expect(received).toHaveLength(1)
      expect((received[0] as {patches: unknown}).patches).toEqual([{set: {foo: 'new'}}])
    })

    it('labels origin "local" via recentOwnTransactionIds when the unverified revision was pruned', () => {
      const events = new Subject<DocumentEvent>()
      const received: DocumentEvent[] = []
      events.subscribe((e) => received.push(e))

      const remote: RemoteDocument = {
        type: 'mutation',
        documentId: docId,
        document: {...exampleDoc, _id: docId, foo: 'new'},
        revision: 'txnPruned',
        previousRev: 'txn0',
        timestamp: '2025-02-06T00:21:00.000Z',
        mutations: [{patch: {id: docId, set: {foo: 'new'}}}],
      }

      // a sync event racing the listener echo pruned the unverified revision,
      // but the transaction ID is still tracked as one of our own
      applyRemoteDocument(createInitialState({}, ['txnPruned']), remote, events)

      expect(received).toHaveLength(1)
      expect(received[0]).toMatchObject({
        type: 'remote-patches',
        transactionId: 'txnPruned',
        origin: 'local',
      })
    })
  })

  describe('rebase with preserved operations', () => {
    it('skips a preserved-operations transaction that fails to re-apply and emits rebase-error', () => {
      const docId = getDraftId(DocumentId('doc1'))
      const originalDoc: SanityDocument = {
        ...exampleDoc,
        _id: docId,
        _rev: 'rev1',
        title: 'The quick brown fox',
      }
      const locallyEditedDoc: SanityDocument = {
        ...originalDoc,
        title: 'The quick brown cat',
        _rev: 'txnLocal',
      }

      const appliedTransaction: AppliedTransaction = {
        transactionId: 'txnLocal',
        actions: [
          {
            type: 'document.edit',
            documentId: 'doc1',
            documentType: 'author',
            patches: [{diffMatchPatch: {title: '@@ -13,7 +13,7 @@\n own \n-fox\n+cat\n'}}],
            preserveOperations: true,
          },
        ],
        previous: {[docId]: originalDoc},
        base: {[docId]: originalDoc},
        working: {[docId]: locallyEditedDoc},
        previousRevs: {[docId]: 'rev1'},
        timestamp: '2025-02-06T00:16:00.000Z',
        outgoingActions: [],
        outgoingMutations: [],
      }

      const initialState: SyncTransactionState = {
        queued: [],
        applied: [appliedTransaction],
        outgoing: undefined,
        grants,
        documentStates: {
          [docId]: {
            id: docId,
            subscriptions: ['sub1'],
            local: locallyEditedDoc,
            remote: originalDoc,
            unverifiedRevisions: {},
          },
        },
      }

      // a foreign transaction replaced the title with a non-string, so our
      // diffMatchPatch can no longer re-apply during the rebase
      const remoteDoc: SanityDocument = {
        ...originalDoc,
        title: 42 as unknown as string,
        _rev: 'txnForeign',
      }
      const remote: RemoteDocument = {
        type: 'mutation',
        documentId: docId,
        document: remoteDoc,
        revision: 'txnForeign',
        previousRev: 'rev1',
        timestamp: '2025-02-06T00:17:00.000Z',
        mutations: [{patch: {id: docId, set: {title: 42}}}],
      }

      const events = new Subject<DocumentEvent>()
      const received: DocumentEvent[] = []
      events.subscribe((e) => received.push(e))

      const newState = applyRemoteDocument(initialState, remote, events)

      const rebaseErrors = received.filter((e) => e.type === 'rebase-error')
      expect(rebaseErrors).toHaveLength(1)
      expect(rebaseErrors[0]).toMatchObject({
        type: 'rebase-error',
        transactionId: 'txnLocal',
        documentId: 'doc1',
        message: expect.stringMatching(/Failed to apply patches to the working document/),
      })

      // the failing transaction is dropped and local converges to remote
      expect(newState.applied).toEqual([])
      expect(newState.documentStates[docId]?.local).toEqual(remoteDoc)
      expect(newState.documentStates[docId]?.remote).toEqual(remoteDoc)
    })

    it('re-applies preserved keyed patches onto a diverged remote document', () => {
      const docId = getDraftId(DocumentId('doc1'))
      const originalDoc: SanityDocument = {
        ...exampleDoc,
        _id: docId,
        _rev: 'rev1',
        items: [
          {_key: 'a', value: 'first'},
          {_key: 'b', value: 'second'},
        ],
      }
      const locallyEditedDoc: SanityDocument = {
        ...originalDoc,
        items: [
          {_key: 'a', value: 'first'},
          {_key: 'c', value: 'in between'},
          {_key: 'b', value: 'second'},
        ],
        _rev: 'txnLocal',
      }

      const appliedTransaction: AppliedTransaction = {
        transactionId: 'txnLocal',
        actions: [
          {
            type: 'document.edit',
            documentId: 'doc1',
            documentType: 'author',
            patches: [
              {insert: {after: 'items[_key=="a"]', items: [{_key: 'c', value: 'in between'}]}},
            ],
            preserveOperations: true,
          },
        ],
        previous: {[docId]: originalDoc},
        base: {[docId]: originalDoc},
        working: {[docId]: locallyEditedDoc},
        previousRevs: {[docId]: 'rev1'},
        timestamp: '2025-02-06T00:18:00.000Z',
        outgoingActions: [],
        outgoingMutations: [],
      }

      const initialState: SyncTransactionState = {
        queued: [],
        applied: [appliedTransaction],
        outgoing: undefined,
        grants,
        documentStates: {
          [docId]: {
            id: docId,
            subscriptions: ['sub1'],
            local: locallyEditedDoc,
            remote: originalDoc,
            unverifiedRevisions: {},
          },
        },
      }

      // a foreign transaction appended a new item concurrently
      const remoteDoc: SanityDocument = {
        ...originalDoc,
        items: [
          {_key: 'a', value: 'first'},
          {_key: 'b', value: 'second'},
          {_key: 'd', value: 'appended remotely'},
        ],
        _rev: 'txnForeign',
      }
      const remote: RemoteDocument = {
        type: 'mutation',
        documentId: docId,
        document: remoteDoc,
        revision: 'txnForeign',
        previousRev: 'rev1',
        timestamp: '2025-02-06T00:19:00.000Z',
        mutations: [
          {
            patch: {
              id: docId,
              insert: {after: 'items[-1]', items: [{_key: 'd', value: 'appended remotely'}]},
            },
          },
        ],
      }

      const events = new Subject<DocumentEvent>()
      const newState = applyRemoteDocument(initialState, remote, events)

      // both edits survive: our keyed insert re-anchors after item "a" while
      // the remote append is preserved
      expect(newState.documentStates[docId]?.local?.['items']).toEqual([
        {_key: 'a', value: 'first'},
        {_key: 'c', value: 'in between'},
        {_key: 'b', value: 'second'},
        {_key: 'd', value: 'appended remotely'},
      ])
      expect(newState.applied).toHaveLength(1)
    })
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
