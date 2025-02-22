/* eslint-disable @typescript-eslint/no-explicit-any */
// getProject.test.ts
import {type SanityProject} from '@sanity/client'
import {type Observable, type Operator} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {type ActionContext} from '../../resources/createAction'
import {type ResourceState} from '../../resources/createResource'
import {type ProjectState} from '../projectStore'
import {getProject} from './getProject'

// Mock getGlobalClient so we can provide a fake client implementation
vi.mock('../../client/actions/getGlobalClient', () => ({
  getGlobalClient: vi.fn(),
}))

// Helper to create a mock ResourceState<ProjectState> without using "as any"
function createMockResourceState(initial: ProjectState): ResourceState<ProjectState> {
  let store = structuredClone(initial) // create a clone to avoid shared mutations
  return {
    get: () => store,
    set: (
      _actionName: string,
      stateOrUpdater: Partial<ProjectState> | ((s: ProjectState) => Partial<ProjectState>),
    ) => {
      const payload = typeof stateOrUpdater === 'function' ? stateOrUpdater(store) : stateOrUpdater
      store = {...store, ...payload}
      if (payload.projectStatus) {
        store.projectStatus = {...store.projectStatus, ...payload.projectStatus}
      }
      if (payload.projects) {
        store.projects = payload.projects
      }
    },
    observable: {
      subscribe: vi.fn(),
      source: undefined,
      operator: undefined,
      lift: function <R>(_operator?: Operator<ProjectState, R> | undefined): Observable<R> {
        throw new Error('Function not implemented.')
      },
      forEach: function (_next: (value: ProjectState) => void): Promise<void> {
        throw new Error('Function not implemented.')
      },
      pipe: function (): Observable<ProjectState> {
        throw new Error('Function not implemented.')
      },
      toPromise: function (): Promise<ProjectState | undefined> {
        throw new Error('Function not implemented.')
      },
    },
  }
}

describe('getProject', () => {
  let mockState: ResourceState<ProjectState>
  let actionContext: ActionContext<ProjectState>

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()

    // Create a fresh mock store
    mockState = createMockResourceState({
      projects: [],
      projectStatus: {},
    })

    // We'll use a fake "instance" object for the ActionContext
    actionContext = {
      instance: {token: 'fake-token'} as any, // It's often safe to pass partial instance
      state: mockState,
    }

    // By default, mock the global client to return a simple dummy
    ;(getGlobalClient as Mock).mockImplementation(() => ({
      projects: {
        getById: vi.fn(async (id: string) => {
          return {id, displayName: `Project ${id}`} as SanityProject
        }),
      },
    }))
  })

  it('returns cached project if it already exists and is not pending', async () => {
    // Seed the mock store with an existing project
    const existingProject: SanityProject = {
      id: 'proj-1',
      displayName: 'Existing Project',
      studioHost: null,
      organizationId: null,
      isBlocked: false,
      isDisabled: false,
      isDisabledByUser: false,
      createdAt: '',
      members: [],
      metadata: {
        cliInitializedAt: undefined,
        color: undefined,
        externalStudioHost: undefined,
      },
    }
    mockState.set('', {
      projects: [existingProject],
      projectStatus: {
        'proj-1': {isPending: false, initialLoadComplete: true},
      },
    })

    const result = await getProject(actionContext, 'proj-1')
    expect(result).toEqual(existingProject)

    // Ensure we did NOT fetch from the global client
    expect(getGlobalClient).not.toHaveBeenCalled()
  })

  it('returns a loading placeholder if the project is currently pending', async () => {
    // Seed the mock store with a pending state
    mockState.set('', {
      projects: [{id: 'proj-2', displayName: 'Placeholder'} as SanityProject],
      projectStatus: {'proj-2': {isPending: true}},
    })

    const result = await getProject(actionContext, 'proj-2')
    expect(result).toEqual({id: 'proj-2', displayName: 'Placeholder'})
    expect(getGlobalClient).not.toHaveBeenCalled()
  })

  it('fetches project if not in store, and updates state', async () => {
    const result = await getProject(actionContext, 'proj-3')
    // Check that we actually fetched from the global client
    expect(getGlobalClient).toHaveBeenCalled()

    // The returned project should be the mock from getGlobalClient
    expect(result).toEqual({id: 'proj-3', displayName: 'Project proj-3'})

    // Verify the store got updated
    const currentState = mockState.get()
    expect(currentState.projects).toMatchObject([{id: 'proj-3'}])
    expect(currentState.projectStatus['proj-3']).toMatchObject({
      isPending: false,
      initialLoadComplete: true,
    })
  })

  it('forces refetch if forceRefetch = true', async () => {
    // Seed the store with a project, but isPending=false
    const existingProject: SanityProject = {
      id: 'proj-4',
      displayName: 'Old Data',
      studioHost: null,
      organizationId: null,
      isBlocked: false,
      isDisabled: false,
      isDisabledByUser: false,
      createdAt: '',
      members: [],
      metadata: {
        cliInitializedAt: undefined,
        color: undefined,
        externalStudioHost: undefined,
      },
    }
    mockState.set('', {
      projects: [existingProject],
      projectStatus: {'proj-4': {isPending: false, initialLoadComplete: true}},
    })

    // Now call getProject with forceRefetch
    const result = await getProject(actionContext, 'proj-4', true)
    // Should fetch from the global client
    expect(getGlobalClient).toHaveBeenCalled()

    // Check we got fresh data from the mock getGlobalClient
    expect(result).toEqual({id: 'proj-4', displayName: 'Project proj-4'})

    // Check store is updated with new data
    const currentState = mockState.get()
    expect(currentState.projects).toEqual([{id: 'proj-4', displayName: 'Project proj-4'}])
  })

  it('handles errors and sets error state', async () => {
    // Make the global client throw
    ;(getGlobalClient as Mock).mockImplementation(() => ({
      projects: {
        getById: vi.fn(async () => {
          throw new Error('Fetch failed')
        }),
      },
    }))

    // We must catch the error from getProject
    await expect(getProject(actionContext, 'bad-id')).rejects.toThrow('Fetch failed')

    // Check the store got an error state for 'bad-id'
    const stateAfterError = mockState.get()
    expect(stateAfterError.projectStatus['bad-id']).toMatchObject({
      isPending: false,
      error: new Error('Fetch failed'),
      initialLoadComplete: false,
    })
  })
})
