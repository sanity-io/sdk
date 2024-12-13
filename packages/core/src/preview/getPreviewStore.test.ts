import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {getPreviewStore} from './getPreviewStore' // Adjust the path if necessary
import {createPreviewStore} from './previewStore'

vi.mock('./previewStore', () => ({
  createPreviewStore: vi.fn(),
}))

vi.mock('../instance/sanityInstance', () => ({
  getOrCreateResource: vi.fn(),
}))

describe('getPreviewStore', () => {
  let mockInstance: SanityInstance

  beforeEach(() => {
    vi.clearAllMocks()
    mockInstance = {
      identity: {id: 'identity', projectId: 'testProject', dataset: 'testDataset'},
      config: {},
    }
  })

  it('should call getOrCreateResource with correct arguments', () => {
    getPreviewStore(mockInstance)

    expect(getOrCreateResource).toHaveBeenCalledTimes(1)
    expect(getOrCreateResource).toHaveBeenCalledWith(
      mockInstance,
      'previewStore',
      expect.any(Function),
    )
  })

  it('should pass createPreviewStore as the creator function', () => {
    getPreviewStore(mockInstance)

    const creatorFunction = (getOrCreateResource as Mock).mock.calls[0][2]
    creatorFunction()

    expect(createPreviewStore).toHaveBeenCalledTimes(1)
    expect(createPreviewStore).toHaveBeenCalledWith(mockInstance)
  })
})
