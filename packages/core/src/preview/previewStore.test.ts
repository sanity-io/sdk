import {Observable} from 'rxjs'
import {describe, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {createStoreInstance} from '../store/createStoreInstance'
import {previewStore} from './previewStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

vi.mock('./subscribeToStateAndFetchBatches')

describe('previewStore', () => {
  it('is a resource that initializes with state and subscriptions', async () => {
    const teardown = vi.fn()
    const subscriber = vi.fn().mockReturnValue(teardown)
    vi.mocked(subscribeToStateAndFetchBatches).mockReturnValue(
      new Observable(subscriber).subscribe(),
    )

    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const {state, dispose} = createStoreInstance(instance, previewStore)

    expect(subscribeToStateAndFetchBatches).toHaveBeenCalledWith({instance, state})

    dispose()
    instance.dispose()
  })
})
