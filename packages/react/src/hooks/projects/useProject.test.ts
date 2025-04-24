import {getProjectState, type ProjectHandle, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

// Mock dependencies
vi.mock('@sanity/sdk', () => ({
  getProjectState: vi.fn(() => ({
    getCurrent: vi.fn(() => undefined), // Mocking getCurrent to satisfy the call within shouldSuspend
  })),
  resolveProject: vi.fn(),
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useProject', () => {
  // Use beforeEach to reset modules and ensure mocks are fresh for each test
  beforeEach(() => {
    vi.resetModules()
    // Re-mock dependencies for each test after resetModules
    vi.mock('@sanity/sdk', () => ({
      getProjectState: vi.fn(() => ({
        getCurrent: vi.fn(() => undefined),
      })),
      resolveProject: vi.fn(),
    }))
    vi.mock('../helpers/createStateSourceHook', () => ({
      createStateSourceHook: vi.fn(),
    }))
  })

  it('should call createStateSourceHook with correct arguments on import', async () => {
    // Dynamically import the hook *after* mocks are set up and modules reset
    await import('./useProject')

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

  it('shouldSuspend should call getProjectState and getCurrent', async () => {
    // Dynamically import the hook *after* mocks are set up and modules reset
    await import('./useProject')

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

    // Assert that getProjectState was called with the correct arguments
    // Need to ensure getProjectState mock is correctly typed for access
    const mockGetProjectState = getProjectState as ReturnType<typeof vi.fn>
    expect(mockGetProjectState).toHaveBeenCalledWith(mockInstance, mockProjectHandle)

    // Assert that getCurrent was called on the result of getProjectState
    expect(mockGetProjectState.mock.results.length).toBeGreaterThan(0)
    const getProjectStateMockResult = mockGetProjectState.mock.results[0].value
    expect(getProjectStateMockResult.getCurrent).toHaveBeenCalled()

    // Assert the result of shouldSuspend based on the mocked getCurrent value
    expect(result).toBe(true) // Since getCurrent is mocked to return undefined
  })
})
