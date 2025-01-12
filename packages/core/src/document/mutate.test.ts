import {patch} from '@sanity/mutate'
import type {OptimisticStore} from '@sanity/mutate/_unstable_store'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {documentStore, type DocumentStoreState} from './documentStore'
import {mutate} from './mutate'

describe('mutate', () => {
  const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  const initialState = documentStore.getInitialState(instance)
  let state: ResourceState<DocumentStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
  })

  it('returns false if the optimisticStore has not been set yet', () => {
    expect(mutate({state, instance}, [patch('documentId', [])])).toBe(false)
  })

  it('calls `optimisticStore.mutate` and updates lastMutation', () => {
    const mockMutateResult = 'mock mutate result'
    const mockMutate = vi.fn().mockReturnValue(mockMutateResult)
    state.set('setMockOptimisticStore', {
      optimisticStore: {mutate: mockMutate} as unknown as OptimisticStore,
    })

    expect(mutate({state, instance}, [patch('documentId', [])])).toBe(mockMutateResult)
    expect(typeof state.get().mutationRefreshKey).toBe('string')
  })
})
