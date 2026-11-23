import {type TransactionLogEventWithEffects} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {getEditEvents, getEffectState} from './synthesizeEditEvents'

describe('getEffectState', () => {
  it('classifies missing, created, modified, and deleted Mendoza effects', () => {
    expect(getEffectState(undefined)).toBe('noop')
    expect(getEffectState({apply: [1, 'doc'], revert: [0, null]})).toBe('created')
    expect(getEffectState({apply: [0, null], revert: [1, 'doc']})).toBe('deleted')
    expect(getEffectState({apply: [1, 'next'], revert: [1, 'prev']})).toBe('modified')
  })
})

describe('getEditEvents', () => {
  it('groups edits within 5 minutes, sets normalized published documentId + variantId, and computes previousRevisionId', () => {
    const transactions: TransactionLogEventWithEffects[] = [
      {
        id: 'rev-create',
        author: 'user-1',
        timestamp: '2025-05-06T12:00:00.000Z',
        documentIDs: ['drafts.article-1'],
        effects: {'drafts.article-1': {apply: [1, 'init'], revert: [0, null]}},
      },
      {
        id: 'rev-1',
        author: 'user-1',
        timestamp: '2025-05-06T12:01:00.000Z',
        documentIDs: ['drafts.article-1'],
        effects: {'drafts.article-1': {apply: [1, 'a'], revert: [1, 'init']}},
      },
      {
        id: 'rev-2',
        author: 'user-2',
        timestamp: '2025-05-06T12:03:00.000Z',
        documentIDs: ['drafts.article-1'],
        effects: {'drafts.article-1': {apply: [1, 'b'], revert: [1, 'a']}},
      },
      {
        id: 'rev-3',
        author: 'user-1',
        timestamp: '2025-05-06T12:12:00.000Z',
        documentIDs: ['drafts.article-1'],
        effects: {'drafts.article-1': {apply: [1, 'c'], revert: [1, 'b']}},
      },
    ]

    const events = getEditEvents(transactions, 'drafts.article-1')
    expect(events).toEqual([
      {
        id: 'drafts.article-1:rev-3',
        type: 'edited',
        documentId: 'article-1',
        variantId: 'drafts.article-1',
        documentVariantType: 'draft',
        author: 'user-1',
        timestamp: '2025-05-06T12:12:00.000Z',
        revisionId: 'rev-3',
        previousRevisionId: 'rev-2',
        contributors: ['user-1'],
        transactions: [
          {
            type: 'editTransaction',
            author: 'user-1',
            timestamp: '2025-05-06T12:12:00.000Z',
            revisionId: 'rev-3',
          },
        ],
      },
      {
        id: 'drafts.article-1:rev-2',
        type: 'edited',
        documentId: 'article-1',
        variantId: 'drafts.article-1',
        documentVariantType: 'draft',
        author: 'user-2',
        timestamp: '2025-05-06T12:03:00.000Z',
        revisionId: 'rev-2',
        previousRevisionId: 'rev-create',
        contributors: ['user-2', 'user-1'],
        transactions: [
          {
            type: 'editTransaction',
            author: 'user-2',
            timestamp: '2025-05-06T12:03:00.000Z',
            revisionId: 'rev-2',
          },
          {
            type: 'editTransaction',
            author: 'user-1',
            timestamp: '2025-05-06T12:01:00.000Z',
            revisionId: 'rev-1',
          },
        ],
      },
    ])
  })

  it('uses initialPreviousRevisionId when no create transaction precedes edits and resets after deletions', () => {
    const transactions: TransactionLogEventWithEffects[] = [
      {
        id: 'rev-edit-1',
        author: 'user-1',
        timestamp: '2025-05-06T12:01:00.000Z',
        documentIDs: ['versions.r1.article-1'],
        effects: {'versions.r1.article-1': {apply: [1, 'a'], revert: [1, 'init']}},
      },
      {
        id: 'rev-del',
        author: 'user-1',
        timestamp: '2025-05-06T12:02:00.000Z',
        documentIDs: ['versions.r1.article-1'],
        effects: {'versions.r1.article-1': {apply: [0, null], revert: [1, 'a']}},
      },
      {
        id: 'rev-edit-2',
        author: 'user-2',
        timestamp: '2025-05-06T12:10:00.000Z',
        documentIDs: ['versions.r1.article-1'],
        effects: {'versions.r1.article-1': {apply: [1, 'b'], revert: [1, 'a']}},
      },
    ]

    const events = getEditEvents(transactions, 'versions.r1.article-1', 'rev-base')
    expect(events).toHaveLength(2)
    expect(events[0]?.previousRevisionId).toBeUndefined()
    expect(events[0]?.documentId).toBe('article-1')
    expect(events[0]?.variantId).toBe('versions.r1.article-1')
    expect(events[1]?.previousRevisionId).toBe('rev-base')
  })
})
