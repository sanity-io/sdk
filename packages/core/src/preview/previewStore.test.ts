import {describe, expect, it, type Mock, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {previewStore} from './previewStore'

vi.mock('./subscribeToLiveAndSetLastLiveEventId', () => ({
  subscribeToLiveAndSetLastLiveEventId: vi.fn(),
}))

vi.mock('./subscribeToStateAndFetchBatches', () => ({
  subscribeToStateAndFetchBatches: vi.fn(),
}))

import {subscribeToLiveAndSetLastLiveEventId} from './subscribeToLiveAndSetLastLiveEventId'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

describe('previewStore', () => {
  it('is a resource that initializes with state and subscriptions', () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const initialState = previewStore.getInitialState(instance)

    expect(initialState).toEqual({
      documentTypes: {},
      lastLiveEventId: null,
      subscriptions: {},
      syncTags: {},
      values: {},
    })
    const liveUnsubscribe = vi.fn()
    const stateUnsubscribe = vi.fn()

    ;(subscribeToLiveAndSetLastLiveEventId as Mock).mockImplementation(() => ({
      unsubscribe: liveUnsubscribe,
    }))
    ;(subscribeToStateAndFetchBatches as Mock).mockImplementation(() => ({
      unsubscribe: stateUnsubscribe,
    }))

    const dispose = previewStore.initialize!.call(
      {
        instance,
        state: createResourceState(initialState),
      },
      instance,
    )

    expect(subscribeToLiveAndSetLastLiveEventId).toHaveBeenCalledOnce()
    expect(subscribeToStateAndFetchBatches).toHaveBeenCalledOnce()

    dispose()

    expect(liveUnsubscribe).toHaveBeenCalledOnce()
    expect(stateUnsubscribe).toHaveBeenCalledOnce()
  })
})
