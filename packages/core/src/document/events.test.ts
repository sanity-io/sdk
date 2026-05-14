import {describe, expect, it} from 'vitest'

import {type Action, type DocumentAction} from '../document/actions'
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
        (a) => 'documentId' in a && 'documentId' in event && event.documentId === a.documentId,
      )
      expect(action).toBeDefined()
      expect(event.type).toEqual(expectedMap[action!.type])
      expect((event as Extract<DocumentEvent, {outgoing: unknown}>).outgoing).toBe(outgoing)
    })
  })

  it('emits created/edited/deleted events for release.create/edit/delete with release doc IDs', () => {
    const outgoing: OutgoingTransaction = {
      transactionId: 'txn-release',
      actions: [
        {type: 'release.create', releaseId: 'r1'} as Action,
        {type: 'release.edit', releaseId: 'r2', patch: {set: {}}} as Action,
        {type: 'release.delete', releaseId: 'r3'} as Action,
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
    expect(events).toEqual([
      {type: 'created', documentId: '_.releases.r1', outgoing},
      {type: 'edited', documentId: '_.releases.r2', outgoing},
      {type: 'deleted', documentId: '_.releases.r3', outgoing},
    ])
  })

  it('skips release actions that have no local mutation (publish/schedule/archive/etc.)', () => {
    const outgoing: OutgoingTransaction = {
      transactionId: 'txn-release-noop',
      actions: [
        {type: 'release.publish', releaseId: 'r1'} as Action,
        {
          type: 'release.schedule',
          releaseId: 'r2',
          publishAt: '2026-01-01T00:00:00.000Z',
        } as Action,
        {type: 'release.unschedule', releaseId: 'r3'} as Action,
        {type: 'release.archive', releaseId: 'r4'} as Action,
        {type: 'release.unarchive', releaseId: 'r5'} as Action,
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

    expect(getDocumentEvents(outgoing)).toEqual([])
  })
})
