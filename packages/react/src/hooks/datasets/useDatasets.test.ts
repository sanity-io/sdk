import {getDatasetsState, type ProjectHandle, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

// Mock dependencies
vi.mock('@sanity/sdk', () => ({
  getDatasetsState: vi.fn(() => ({
    getCurrent: vi.fn(() => undefined), // Mocking getCurrent to satisfy the call within shouldSuspend
  })),
  resolveDatasets: vi.fn(),
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useDatasets', () => {
  // Use beforeEach to reset modules and ensure mocks are fresh for each test
  beforeEach(() => {
    vi.resetModules()
    // Re-mock dependencies for each test after resetModules
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
    // Dynamically import the hook *after* mocks are set up and modules reset
    await import('./useDatasets')

    // Check if createStateSourceHook was called during the module evaluation (import)
    expect(createStateSourceHook).toHaveBeenCalled()
    expect(createStateSourceHook).toHaveBeenCalledWith(
      expect.objectContaining({
        getState: expect.any(Function),
        shouldSuspend: expect.any(Function),
        suspender: expect.any(Function), // Actual function reference doesn't matter here as it's mocked
        getConfig: expect.any(Function), // Actual function reference doesn't matter here
      }),
    )
  })

  it('shouldSuspend should call getDatasetsState and getCurrent', async () => {
    // Dynamically import the hook *after* mocks are set up and modules reset
    await import('./useDatasets')

    // Get the arguments passed to createStateSourceHook
    // Need to ensure createStateSourceHook mock is correctly typed for access
    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const shouldSuspend = createStateSourceHookArgs.shouldSuspend

    // Mock instance and projectHandle for the test call
    const mockInstance = {} as SanityInstance // Use specific type
    const mockProjectHandle = {} as ProjectHandle // Use specific type

    // Call the shouldSuspend function
    const result = shouldSuspend(mockInstance, mockProjectHandle)

    // Assert that getDatasetsState was called with the correct arguments
    // Need to ensure getDatasetsState mock is correctly typed for access
    const mockGetDatasetsState = getDatasetsState as ReturnType<typeof vi.fn>
    expect(mockGetDatasetsState).toHaveBeenCalledWith(mockInstance, mockProjectHandle)

    // Assert that getCurrent was called on the result of getDatasetsState
    expect(mockGetDatasetsState.mock.results.length).toBeGreaterThan(0)
    const getDatasetsStateMockResult = mockGetDatasetsState.mock.results[0].value
    expect(getDatasetsStateMockResult.getCurrent).toHaveBeenCalled()

    // Assert the result of shouldSuspend based on the mocked getCurrent value
    expect(result).toBe(true) // Since getCurrent is mocked to return undefined
  })
})
