import {Observable} from 'rxjs'
import {describe, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {createStoreInstance} from '../store/createStoreInstance'
import {projectionStore} from './projectionStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

// Mock the module with a factory function
vi.mock('../common/createLiveEventSubscriber', () => {
  const mockLiveSubscriber = vi.fn()
  return {
    createLiveEventSubscriber: vi.fn(() => mockLiveSubscriber),
  }
})

vi.mock('./subscribeToStateAndFetchBatches')

describe('projectionStore', () => {
  it('is a resource that initializes with state and subscriptions', async () => {
    const teardown = vi.fn()
    const subscriber = vi.fn().mockReturnValue(teardown)
    vi.mocked(subscribeToStateAndFetchBatches).mockReturnValue(
      new Observable(subscriber).subscribe(),
    )

    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const {state, dispose} = createStoreInstance(instance, projectionStore)

    expect(subscribeToStateAndFetchBatches).toHaveBeenCalledOnce()
    expect(subscribeToStateAndFetchBatches).toHaveBeenCalledWith({instance, state})

    dispose()
    instance.dispose()
  })
})
