import {DocumentId} from '@sanity/id-utils'
import {type SanityDocument} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {toUnknownDocumentId} from './documentKey'
import {
  addVariantSubscription,
  createPendingVariantEntry,
  getVariantCandidateKeys,
  markVariantAbsent,
  removeVariantSubscription,
  resolveVariantIds,
  resolveVariantKey,
  resolveVariantToDocument,
  type VariantTrackingState,
} from './variantTracking'

const key = '!doc:drafts,french'
const variantA = DocumentId('versions.a.doc')
const variantB = DocumentId('versions.b.doc')

function createState(overrides: Partial<VariantTrackingState> = {}): VariantTrackingState {
  return {
    documentStates: {},
    variantIndex: {},
    variantSubscriptions: {},
    queued: [],
    applied: [],
    ...overrides,
  }
}

describe('getVariantCandidateKeys', () => {
  it('returns the variant over the bundle, then over published', () => {
    expect(getVariantCandidateKeys({documentId: 'doc', variant: 'french'})).toEqual([
      '!doc:drafts,french',
      '!doc:,french',
    ])
  })

  it('treats the published perspective as drafts, so both keys are always distinct', () => {
    expect(
      getVariantCandidateKeys({documentId: 'doc', variant: 'french', perspective: 'published'}),
    ).toEqual(['!doc:drafts,french', '!doc:,french'])
  })

  it('returns no keys for non-variant and liveEdit handles', () => {
    expect(getVariantCandidateKeys({documentId: 'doc'})).toEqual([])
    expect(getVariantCandidateKeys({documentId: 'doc', variant: 'french', liveEdit: true})).toEqual(
      [],
    )
  })
})

describe('variant key retargeting', () => {
  it('moves subscribers to the new document when a key resolves elsewhere', () => {
    let state = addVariantSubscription(createState(), key, 'sub1')
    state = resolveVariantToDocument(state, key, variantA)
    expect(state.documentStates[variantA]?.subscriptions).toEqual(['sub1'])

    state = resolveVariantToDocument(state, key, variantB)
    expect(state.variantIndex[key]).toBe(variantB)
    expect(state.documentStates[variantB]?.subscriptions).toEqual(['sub1'])
    // nothing else held the old document, so it is evicted
    expect(state.documentStates[variantA]).toBeUndefined()
  })

  it('keeps the old document while another subscriber still holds it', () => {
    let state = addVariantSubscription(createState(), key, 'sub1')
    state = resolveVariantToDocument(state, key, variantA)
    state = {
      ...state,
      documentStates: {
        ...state.documentStates,
        [variantA]: {id: variantA, subscriptions: ['sub1', 'other']},
      },
    }

    state = resolveVariantToDocument(state, key, variantB)
    expect(state.documentStates[variantA]?.subscriptions).toEqual(['other'])
  })

  it('releases the document when the variant disappears', () => {
    let state = addVariantSubscription(createState(), key, 'sub1')
    state = resolveVariantToDocument(state, key, variantA)

    state = markVariantAbsent(state, key)
    expect(state.variantIndex[key]).toBeNull()
    expect(state.documentStates[variantA]).toBeUndefined()

    // the subscriber leaving afterwards leaves nothing behind
    state = removeVariantSubscription(state, key, 'sub1')
    expect(state.documentStates).toEqual({})
    expect(state.variantSubscriptions).toEqual({})
    expect(state.variantIndex).toEqual({})
  })
})

describe('removeVariantSubscription', () => {
  it('drops the index entry only when the last subscriber leaves', () => {
    let state = addVariantSubscription(createState(), key, 'sub1')
    state = addVariantSubscription(state, key, 'sub2')
    state = resolveVariantToDocument(state, key, variantA)

    state = removeVariantSubscription(state, key, 'sub1')
    expect(state.variantIndex[key]).toBe(variantA)
    expect(state.documentStates[variantA]?.subscriptions).toEqual(['sub2'])

    state = removeVariantSubscription(state, key, 'sub2')
    expect(state.variantIndex).toEqual({})
    expect(state.documentStates).toEqual({})
  })

  it('drops an absent marker with the last subscriber', () => {
    let state = addVariantSubscription(createState(), key, 'sub1')
    state = markVariantAbsent(state, key)

    state = removeVariantSubscription(state, key, 'sub1')
    expect(state.variantIndex).toEqual({})
  })
})

describe('pending variants', () => {
  const pendingKey = toUnknownDocumentId(key)
  const pendingDocument = {
    _id: pendingKey,
    _type: 'article',
    _createdAt: '2025-02-06T06:43:46.236Z',
    _updatedAt: '2025-02-06T06:43:46.236Z',
    _rev: 'pending',
  } as SanityDocument

  const withPendingVariant = (subscriptionId: string) =>
    createPendingVariantEntry(
      addVariantSubscription(createState(), key, subscriptionId),
      pendingKey,
      pendingDocument,
    )

  it('resolves to the pending entry while it exists', () => {
    const state = withPendingVariant('sub1')
    expect(resolveVariantKey(state, key)).toBe(pendingKey)
  })

  it('reads as absent once the pending entry is gone, rather than loading forever', () => {
    const state = {...withPendingVariant('sub1'), documentStates: {}}
    expect(state.variantIndex[key]).toBe(pendingKey)
    expect(resolveVariantKey(state, key)).toBeNull()
    // action processing still addresses it by its key, so it can be recreated
    expect(resolveVariantIds(state, [key])?.variantIds).toEqual({[key]: pendingKey})
  })

  it('keeps the index while the entry awaits its own echo', () => {
    let state = withPendingVariant('sub1')
    state = {
      ...state,
      documentStates: {
        ...state.documentStates,
        [pendingKey]: {
          ...state.documentStates[pendingKey]!,
          unverifiedRevisions: {
            tx1: {
              transactionId: 'tx1',
              documentId: pendingKey,
              previousRev: undefined,
              timestamp: new Date().toISOString(),
            },
          },
        },
      },
    }

    state = removeVariantSubscription(state, key, 'sub1')
    expect(state.documentStates[pendingKey]).toBeDefined()
    expect(state.variantIndex[key]).toBe(pendingKey)
  })

  it('drops the index along with an entry evicted by its last subscriber', () => {
    const state = removeVariantSubscription(withPendingVariant('sub1'), key, 'sub1')
    expect(state.documentStates).toEqual({})
    expect(state.variantIndex).toEqual({})
  })

  it('moves subscribers onto the concrete document when the remote announces it', () => {
    const state = resolveVariantToDocument(withPendingVariant('sub1'), key, variantA)
    expect(state.documentStates[pendingKey]).toBeUndefined()
    expect(state.documentStates[variantA]?.subscriptions).toContain('sub1')
    expect(state.variantIndex[key]).toBe(variantA)
  })
})
