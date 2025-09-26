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

    const instance = createSanityInstance()

    const {state, dispose} = createStoreInstance(
      instance,
      {name: 'p.d', projectId: 'p', dataset: 'd'},
      previewStore,
    )

    expect(subscribeToStateAndFetchBatches).toHaveBeenCalledWith({
      instance,
      state,
      key: {name: 'p.d', projectId: 'p', dataset: 'd'},
    })

    dispose()
    instance.dispose()
  })
})
