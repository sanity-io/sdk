import {getProjectsState, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

// Mock dependencies
vi.mock('@sanity/sdk', () => ({
  getProjectsState: vi.fn(() => ({
    getCurrent: vi.fn(() => undefined), // Mocking getCurrent to satisfy the call within shouldSuspend
  })),
  resolveProjects: vi.fn(),
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useProjects', () => {
  // Use beforeEach to reset modules and ensure mocks are fresh for each test
  beforeEach(() => {
    vi.resetModules()
    // Re-mock dependencies for each test after resetModules
    vi.mock('@sanity/sdk', () => ({
      getProjectsState: vi.fn(() => ({
        getCurrent: vi.fn(() => undefined),
      })),
      resolveProjects: vi.fn(),
    }))
    vi.mock('../helpers/createStateSourceHook', () => ({
      createStateSourceHook: vi.fn(),
    }))
  })

  it('should call createStateSourceHook with correct arguments on import', async () => {
    // Dynamically import the hook *after* mocks are set up and modules reset
    await import('./useProjects')

    // Check if createStateSourceHook was called during the module evaluation (import)
    expect(createStateSourceHook).toHaveBeenCalled()
    expect(createStateSourceHook).toHaveBeenCalledWith(
      expect.objectContaining({
        getState: expect.any(Function),
        shouldSuspend: expect.any(Function),
        suspender: expect.any(Function), // Actual function reference doesn't matter here as it's mocked
        // Note: getConfig is not used in useProjects
      }),
    )
  })

  it('shouldSuspend should call getProjectsState and getCurrent', async () => {
    // Dynamically import the hook *after* mocks are set up and modules reset
    await import('./useProjects')

    // Get the arguments passed to createStateSourceHook
    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const shouldSuspend = createStateSourceHookArgs.shouldSuspend

    // Mock instance for the test call
    const mockInstance = {} as SanityInstance // Use specific type

    // Call the shouldSuspend function with both required parameters
    const result = shouldSuspend(mockInstance, undefined) // Pass undefined for options

    // Assert that getProjectsState was called with the correct arguments
    const mockGetProjectsState = getProjectsState as ReturnType<typeof vi.fn>
    expect(mockGetProjectsState).toHaveBeenCalledWith(mockInstance, undefined)

    // Assert that getCurrent was called on the result of getProjectsState
    expect(mockGetProjectsState.mock.results.length).toBeGreaterThan(0)
    const getProjectsStateMockResult = mockGetProjectsState.mock.results[0].value
    expect(getProjectsStateMockResult.getCurrent).toHaveBeenCalled()

    // Assert the result of shouldSuspend based on the mocked getCurrent value
    expect(result).toBe(true) // Since getCurrent is mocked to return undefined
  })

  it('should call createStateSourceHook with correct getState function signature', async () => {
    await import('./useProjects')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook).toHaveBeenCalled()

    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const getState = createStateSourceHookArgs.getState

    // Test that getState can handle the new options parameter
    const mockInstance = {} as SanityInstance
    const mockOptions = {organizationId: 'org123', includeMembers: false}

    // This should not throw
    expect(() => getState(mockInstance, mockOptions)).not.toThrow()
  })

  it('should handle different parameter combinations in shouldSuspend', async () => {
    await import('./useProjects')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const shouldSuspend = createStateSourceHookArgs.shouldSuspend

    const mockInstance = {} as SanityInstance

    // Test with different options
    expect(() => shouldSuspend(mockInstance, undefined)).not.toThrow()
    expect(() => shouldSuspend(mockInstance, {organizationId: 'org123'})).not.toThrow()
    expect(() => shouldSuspend(mockInstance, {includeMembers: false})).not.toThrow()
    expect(() =>
      shouldSuspend(mockInstance, {organizationId: 'org123', includeMembers: false}),
    ).not.toThrow()
  })
})
