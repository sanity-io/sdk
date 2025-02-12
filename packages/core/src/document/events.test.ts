import {describe, expect, it} from 'vitest'

import {type DocumentAction} from '../document/actions'
import {type DocumentEvent, getDocumentEvents} from '../document/events'
import {type OutgoingTransaction} from '../document/reducers'

describe('getDocumentEvents', () => {
  it('should return an array of document events with the correct types and documentIds', () => {
    const outgoing: OutgoingTransaction = {
      transactionId: 'txn1',
      actions: [
        {type: 'document.create', documentId: 'doc1'} as DocumentAction,
        {type: 'document.edit', documentId: 'doc2'} as DocumentAction,
        {type: 'document.delete', documentId: 'doc3'} as DocumentAction,
        {type: 'document.publish', documentId: 'doc4'} as DocumentAction,
        {type: 'document.unpublish', documentId: 'doc5'} as DocumentAction,
        {type: 'document.discard', documentId: 'doc6'} as DocumentAction,
      ],
      disableBatching: false,
      batchedTransactionIds: [],
      outgoingActions: [],
      outgoingMutations: [],
      base: {},
      working: {},
      previous: {},
      previousRevs: {},
      timestamp: '2025-02-06T00:00:00.000Z',
    }

    const events = getDocumentEvents(outgoing)

    const expectedMap: Record<string, string> = {
      'document.create': 'created',
      'document.edit': 'edited',
      'document.delete': 'deleted',
      'document.publish': 'published',
      'document.unpublish': 'unpublished',
      'document.discard': 'discarded',
    }

    expect(events).toHaveLength(outgoing.actions.length)
    events.forEach((event) => {
      const action = outgoing.actions.find(
        (a) => 'documentId' in event && event.documentId === a.documentId,
      )
      expect(action).toBeDefined()
      expect(event.type).toEqual(expectedMap[action!.type])
      expect((event as Extract<DocumentEvent, {outgoing: unknown}>).outgoing).toBe(outgoing)
    })
  })
})
