import {DocumentId} from '@sanity/id-utils'
import {describe, expect, it} from 'vitest'

import {
  addVariantSubscription,
  getVariantCandidateKeys,
  markVariantAbsent,
  removeVariantSubscription,
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
