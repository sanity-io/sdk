import {type Subscription} from 'rxjs'
import {describe, expect, it, type Mock, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {previewStore} from './previewStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {PREVIEW_TAG} from './util'

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

describe('previewStore', () => {
  it('is a resource that initializes with state and subscriptions', async () => {
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

    const {createLiveEventSubscriber} = vi.mocked(
      await import('../common/createLiveEventSubscriber'),
    )
    const mockLiveSubscriber = vi.mocked(createLiveEventSubscriber(PREVIEW_TAG)).mockReturnValue({
      unsubscribe: liveUnsubscribe,
    } as unknown as Subscription)

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

    // Verify the factory was called with the correct tag
    expect(createLiveEventSubscriber).toHaveBeenCalledWith(PREVIEW_TAG)

    // Verify the subscriber was called with the correct context
    expect(mockLiveSubscriber).toHaveBeenCalledWith({
      instance,
      state: expect.any(Object),
    })
    expect(mockLiveSubscriber).toHaveBeenCalledOnce()

    expect(subscribeToStateAndFetchBatches).toHaveBeenCalledOnce()

    dispose()

    expect(liveUnsubscribe).toHaveBeenCalledOnce()
    expect(stateUnsubscribe).toHaveBeenCalledOnce()
  })
})
