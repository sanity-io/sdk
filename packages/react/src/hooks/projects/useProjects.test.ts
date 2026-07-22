import {projects, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

// Mock dependencies
vi.mock('@sanity/sdk', () => ({
  projects: {
    getState: vi.fn(() => ({
      getCurrent: vi.fn(() => ({status: 'pending', data: undefined})),
    })),
    resolveState: vi.fn(),
  },
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
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
        suspender: expect.any(Function),
      }),
    )
  })

  it('shouldSuspend suspends while the fetcher snapshot is pending', async () => {
    await import('./useProjects')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const {shouldSuspend} = mockCreateStateSourceHook.mock.calls[0][0]

    const mockInstance = {} as SanityInstance
    const result = shouldSuspend(mockInstance, undefined)

    // The hook reads the fetcher's snapshot and suspends while data is undefined
    expect(projects.getState).toHaveBeenCalledWith(mockInstance, undefined)
    const projectsStateMockResult = vi.mocked(projects.getState).mock.results[0].value
    expect(projectsStateMockResult.getCurrent).toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('getState maps the snapshot envelope to bare data', async () => {
    await import('./useProjects')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    const {getState} = mockCreateStateSourceHook.mock.calls[0][0]

    const mockInstance = {} as SanityInstance
    vi.mocked(projects.getState).mockReturnValueOnce({
      getCurrent: () => ({status: 'success', data: [{id: 'a'}]}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    expect(getState(mockInstance, undefined).getCurrent()).toEqual([{id: 'a'}])
  })

  it('should handle different parameter combinations in shouldSuspend', async () => {
    await import('./useProjects')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    const {shouldSuspend} = mockCreateStateSourceHook.mock.calls[0][0]

    const mockInstance = {} as SanityInstance

    expect(() => shouldSuspend(mockInstance, undefined)).not.toThrow()
    expect(() => shouldSuspend(mockInstance, {organizationId: 'org123'})).not.toThrow()
    expect(() => shouldSuspend(mockInstance, {includeMembers: false})).not.toThrow()
    expect(() =>
      shouldSuspend(mockInstance, {organizationId: 'org123', includeMembers: false}),
    ).not.toThrow()
  })
})
