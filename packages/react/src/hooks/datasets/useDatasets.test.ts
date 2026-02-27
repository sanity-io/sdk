import {getDatasetsState, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

// Mock dependencies
vi.mock('@sanity/sdk', () => ({
  getDatasetsState: vi.fn(() => ({
    getCurrent: vi.fn(() => undefined),
  })),
  resolveDatasets: vi.fn(),
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useDatasets', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('@sanity/sdk', () => ({
      getDatasetsState: vi.fn(() => ({
        getCurrent: vi.fn(() => undefined),
      })),
      resolveDatasets: vi.fn(),
    }))
    vi.mock('../helpers/createStateSourceHook', () => ({
      createStateSourceHook: vi.fn(),
    }))
  })

  it('should call createStateSourceHook with correct arguments on import', async () => {
    await import('./useDatasets')

    expect(createStateSourceHook).toHaveBeenCalled()
    expect(createStateSourceHook).toHaveBeenCalledWith(
      expect.objectContaining({
        getState: expect.any(Function),
        shouldSuspend: expect.any(Function),
        suspender: expect.any(Function),
      }),
    )
  })

  it('shouldSuspend should call getDatasetsState and getCurrent', async () => {
    await import('./useDatasets')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const shouldSuspend = createStateSourceHookArgs.shouldSuspend

    const mockInstance = {} as SanityInstance
    const mockOptions = {projectId: 'test-project'}

    const result = shouldSuspend(mockInstance, mockOptions)

    const mockGetDatasetsState = getDatasetsState as ReturnType<typeof vi.fn>
    expect(mockGetDatasetsState).toHaveBeenCalledWith(mockInstance, mockOptions)

    expect(mockGetDatasetsState.mock.results.length).toBeGreaterThan(0)
    const getDatasetsStateMockResult = mockGetDatasetsState.mock.results[0].value
    expect(getDatasetsStateMockResult.getCurrent).toHaveBeenCalled()

    expect(result).toBe(true)
  })
})
