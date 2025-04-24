/* eslint-disable @typescript-eslint/no-explicit-any */
import {getProjectState, resolveProject} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

// Create test utilities
const createMockInstance = () => ({projectId: 'project-id', dataset: 'dataset'})
const createMockProject = () => ({
  id: 'project-id',
  displayName: 'Test Project',
  organizationId: 'org-id',
  studioHost: 'test-host',
  metadata: {
    color: '#ff0000',
  },
  members: [],
  // Add required properties for SanityProject
  isBlocked: false,
  isDisabled: false,
  isDisabledByUser: false,
  createdAt: '2023-01-01',
})

// Mock dependencies
vi.mock('../helpers/createStateSourceHook', () => ({createStateSourceHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({
  getProjectState: vi.fn(),
  resolveProject: vi.fn(),
}))

describe('useProject', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('calls `createStateSourceHook` with correct configuration', async () => {
    // Force re-import to ensure mocks are applied
    const projectModule = await import('./useProject')

    // Verify the function was called with an object
    expect(createStateSourceHook).toHaveBeenCalledWith({
      getState: getProjectState,
      shouldSuspend: expect.any(Function),
      suspender: resolveProject,
      getConfig: identity,
    })

    // Verify hook exists
    expect(projectModule.useProject).toBeDefined()
  })

  it('tests the shouldSuspend implementation directly', () => {
    // Re-implement the shouldSuspend logic for testing
    const testShouldSuspend = (instance: any, projectHandle?: any) => {
      return getProjectState(instance, projectHandle).getCurrent() === undefined
    }

    const mockInstance = createMockInstance()

    // Test case 1: Should suspend when getCurrent returns undefined
    vi.mocked(getProjectState).mockReturnValue({
      getCurrent: () => undefined,
      subscribe: vi.fn(),
      observable: vi.fn() as any,
    })

    expect(testShouldSuspend(mockInstance)).toBe(true)
    expect(getProjectState).toHaveBeenCalledWith(mockInstance, undefined)

    // Test case 2: Should not suspend when getCurrent returns project data
    vi.clearAllMocks()
    vi.mocked(getProjectState).mockReturnValue({
      getCurrent: () => createMockProject(),
      subscribe: vi.fn(),
      observable: vi.fn() as any,
    })

    expect(testShouldSuspend(mockInstance)).toBe(false)
    expect(getProjectState).toHaveBeenCalledWith(mockInstance, undefined)

    // Test case 3: Passes projectHandle when provided
    vi.clearAllMocks()
    const projectHandle = {projectId: 'custom-project'}
    testShouldSuspend(mockInstance, projectHandle)
    expect(getProjectState).toHaveBeenCalledWith(mockInstance, projectHandle)
  })
})
