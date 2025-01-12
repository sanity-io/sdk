import type {OptimisticStore} from '@sanity/mutate/_unstable_store'
import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {randomId} from '../preview/util'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {documentStore, type DocumentStoreState} from './documentStore'
import {subscribeToStateAndSubmitMutations} from './subscribeToStateAndSubmitMutations'

describe('subscribeToStateAndSubmitMutations', () => {
  const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  const initialState = documentStore.getInitialState(instance)
  let state: ResourceState<DocumentStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
  })

  it('listens to the `mutationRefreshKey` and queues up submissions', async () => {
    const submit = vi.fn().mockResolvedValue({})
    state.set('setOptimisticStore', {
      optimisticStore: {submit} as unknown as OptimisticStore,
    })

    const subscription = subscribeToStateAndSubmitMutations({instance, state})
    expect(submit).not.toHaveBeenCalled()

    state.set('updateMutationRefreshKey', {mutationRefreshKey: randomId()})

    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalled()
    })

    subscription.unsubscribe()
  })

  it('throttles the submissions', async () => {
    const submit = vi.fn().mockResolvedValue({})
    state.set('setOptimisticStore', {
      optimisticStore: {submit} as unknown as OptimisticStore,
    })

    const subscription = subscribeToStateAndSubmitMutations({instance, state})
    expect(submit).not.toHaveBeenCalled()

    state.set('updateMutationRefreshKey', {mutationRefreshKey: randomId()})
    state.set('updateMutationRefreshKey', {mutationRefreshKey: randomId()})
    state.set('updateMutationRefreshKey', {mutationRefreshKey: randomId()})

    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalled()
    })

    expect(submit).toHaveBeenCalledTimes(1)

    subscription.unsubscribe()
  })

  it('sets an error if any occur from the client stream', () => {
    const subject = new Subject()
    // overwrite the state observable
    Object.assign(state, {observable: subject})

    subscribeToStateAndSubmitMutations({instance, state})
    expect(state.get().error).toBe(undefined)

    const testError = new Error('test error')
    subject.error(testError)
    expect(state.get().error).toBe(testError)
  })
})
