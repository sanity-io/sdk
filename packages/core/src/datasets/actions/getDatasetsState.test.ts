import {describe, expect, it, vi} from 'vitest'

import {type SanityInstance} from '../../instance/types'
import {getDatasetsState} from './getDatasetsState'

// Mock projectStore with the expected structure
const projectStore = {
  state: {
    get: vi.fn(() => ({
      datasets: [],
      isPending: false,
      error: null,
      initialLoadComplete: true,
    })),
    set: vi.fn(),
    observable: {
      subscribe: vi.fn(() => ({
        unsubscribe: vi.fn(),
      })),
    },
  },
}

describe('getDatasetsState', () => {
  const mockInstance: SanityInstance = {
    identity: {
      id: 'test-identity-id',
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    },
    config: {},
    dispose: function (): void {
      throw new Error('Function not implemented.')
    },
  }

  it('should call the subscription callback on state change', () => {
    const {subscribe} = getDatasetsState(mockInstance)
    const callback = vi.fn()

    const unsubscribe = subscribe(callback)

    // Simulate a state change
    projectStore.state.set({...projectStore.state.get(), datasets: []})

    expect(callback).toHaveBeenCalled()

    unsubscribe()
  })
})
