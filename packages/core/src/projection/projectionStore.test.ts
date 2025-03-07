import {type Subscription} from 'rxjs'
import {describe, expect, it, type Mock, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {projectionStore} from './projectionStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {PROJECTION_TAG} from './util'

// Mock the module with a factory function
vi.mock('../common/createLiveEventSubscriber', () => {
  const mockLiveSubscriber = vi.fn()
  return {
    createLiveEventSubscriber: vi.fn(() => mockLiveSubscriber),
  }
})

vi.mock('./subscribeToStateAndFetchBatches', () => ({
  subscribeToStateAndFetchBatches: vi.fn(),
}))

describe('projectionStore', () => {
  it('is a resource that initializes with state and subscriptions', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const initialState = projectionStore.getInitialState(instance)

    expect(initialState).toEqual({
      values: {},
      documentProjections: {},
      subscriptions: {},
      syncTags: {},
      lastLiveEventId: null,
    })

    const liveUnsubscribe = vi.fn()
    const stateUnsubscribe = vi.fn()

    const {createLiveEventSubscriber} = vi.mocked(
      await import('../common/createLiveEventSubscriber'),
    )
    const mockLiveSubscriber = vi
      .mocked(createLiveEventSubscriber(PROJECTION_TAG))
      .mockReturnValue({
        unsubscribe: liveUnsubscribe,
      } as unknown as Subscription)

    ;(subscribeToStateAndFetchBatches as Mock).mockImplementation(() => ({
      unsubscribe: stateUnsubscribe,
    }))

    const dispose = projectionStore.initialize!.call(
      {
        instance,
        state: createResourceState(initialState),
      },
      instance,
    )

    // Verify the factory was called with the correct tag
    expect(createLiveEventSubscriber).toHaveBeenCalledWith(PROJECTION_TAG)

    // Verify the subscriber was called with the correct context
    expect(mockLiveSubscriber).toHaveBeenCalledWith({
      instance,
      state: expect.any(Object),
    })

    expect(subscribeToStateAndFetchBatches).toHaveBeenCalledOnce()

    dispose()

    expect(liveUnsubscribe).toHaveBeenCalledOnce()
    expect(stateUnsubscribe).toHaveBeenCalledOnce()
  })
})
