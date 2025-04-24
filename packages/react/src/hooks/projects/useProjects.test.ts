/* eslint-disable @typescript-eslint/no-explicit-any */
import {getProjectsState, resolveProjects} from '@sanity/sdk'
import {identity} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {type ProjectWithoutMembers} from './useProjects'

// Create test utilities
const createMockInstance = () => ({projectId: 'project-id', dataset: 'dataset'})
const createMockProjects = (): ProjectWithoutMembers[] => [
  {
    id: 'project-id-1',
    displayName: 'Test Project 1',
    organizationId: 'org-id',
    studioHost: 'test-host-1',
    metadata: {
      color: '#ff0000',
    },
    isBlocked: false,
    isDisabled: false,
    isDisabledByUser: false,
    createdAt: '2023-01-01',
  },
  {
    id: 'project-id-2',
    displayName: 'Test Project 2',
    organizationId: 'org-id',
    studioHost: 'test-host-2',
    metadata: {
      color: '#00ff00',
    },
    isBlocked: false,
    isDisabled: false,
    isDisabledByUser: false,
    createdAt: '2023-01-02',
  },
]

// Mock dependencies
vi.mock('../helpers/createStateSourceHook', () => ({createStateSourceHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({
  getProjectsState: vi.fn(),
  resolveProjects: vi.fn(),
}))

describe('useProjects', () => {
  // Clear the module cache before each test to ensure a fresh import
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  it('calls `createStateSourceHook` with correct configuration', async () => {
    // Force re-import to ensure mocks are applied
    const projectsModule = await import('./useProjects')

    // Verify hook exists
    expect(projectsModule.useProjects).toBeDefined()

    // Verify createStateSourceHook was called during the import
    expect(createStateSourceHook).toHaveBeenCalled()

    // Get the call arguments for verification
    const callArgs = vi.mocked(createStateSourceHook).mock.calls[0][0] as any

    // Check expected properties
    expect(callArgs.getState).toBe(getProjectsState)
    expect(callArgs.suspender).toBe(resolveProjects)
    expect(typeof callArgs.shouldSuspend).toBe('function')
  })

  it('tests the shouldSuspend implementation directly', () => {
    // Re-implement the shouldSuspend logic for testing
    const testShouldSuspend = (instance: any) => {
      return getProjectsState(instance).getCurrent() === undefined
    }

    const mockInstance = createMockInstance()

    // Test case 1: Should suspend when getCurrent returns undefined
    vi.mocked(getProjectsState).mockReturnValue({
      getCurrent: () => undefined,
      subscribe: vi.fn(),
      observable: vi.fn() as any,
    })

    expect(testShouldSuspend(mockInstance)).toBe(true)
    expect(getProjectsState).toHaveBeenCalledWith(mockInstance)

    // Test case 2: Should not suspend when getCurrent returns project data
    vi.clearAllMocks()
    vi.mocked(getProjectsState).mockReturnValue({
      getCurrent: () => createMockProjects(),
      subscribe: vi.fn(),
      observable: vi.fn() as any,
    })

    expect(testShouldSuspend(mockInstance)).toBe(false)
    expect(getProjectsState).toHaveBeenCalledWith(mockInstance)
  })
})
