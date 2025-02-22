import {type SanityProject} from '@sanity/client'
import {type Observable, type Operator} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {type SanityInstance} from '../../instance/types'
import {type ActionContext} from '../../resources/createAction'
import {type ResourceState} from '../../resources/createResource'
import {type ProjectState} from '../projectStore'
import {getProjects} from './getProjects'

// Mock getGlobalClient
vi.mock('../../client/actions/getGlobalClient', () => ({
  getGlobalClient: vi.fn(),
}))

function createMockResourceState(initial: ProjectState): ResourceState<ProjectState> {
  let store = structuredClone(initial)
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
      lift: function <R>(_operator?: Operator<ProjectState, R>): Observable<R> {
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

describe('getProjects', () => {
  let mockState: ResourceState<ProjectState>
  let actionContext: ActionContext<ProjectState>

  beforeEach(() => {
    vi.resetAllMocks()

    mockState = createMockResourceState({
      projects: [],
      projectStatus: {},
    })

    actionContext = {
      instance: {config: {token: 'fake-token'}} as unknown as SanityInstance,
      state: mockState,
    }

    // Mock default client response
    ;(getGlobalClient as Mock).mockImplementation(() => ({
      projects: {
        list: vi.fn(
          async () =>
            [
              {id: 'proj-1', displayName: 'Project 1'},
              {id: 'proj-2', displayName: 'Project 2'},
            ] as SanityProject[],
        ),
      },
    }))
  })

  it('returns cached projects if they exist and are not pending', async () => {
    const existingProjects: SanityProject[] = [
      {
        id: 'proj-1',
        displayName: 'Existing Project 1',
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
      },
    ]

    mockState.set('', {
      projects: existingProjects,
      projectStatus: {
        __all__: {isPending: false, initialLoadComplete: true},
      },
    })

    const result = await getProjects(actionContext)
    expect(result).toEqual(existingProjects)
    expect(getGlobalClient).not.toHaveBeenCalled()
  })

  it('returns current projects list if already loading', async () => {
    const loadingProjects: SanityProject[] = [
      {id: 'proj-1', displayName: 'Loading Project'} as SanityProject,
    ]
    mockState.set('', {
      projects: loadingProjects,
      projectStatus: {
        __all__: {isPending: true},
      },
    })

    const result = await getProjects(actionContext)
    expect(result).toEqual(loadingProjects)
    expect(getGlobalClient).not.toHaveBeenCalled()
  })

  it('fetches projects if none exist in store', async () => {
    const result = await getProjects(actionContext)

    expect(getGlobalClient).toHaveBeenCalled()
    expect(result).toEqual([
      {id: 'proj-1', displayName: 'Project 1'},
      {id: 'proj-2', displayName: 'Project 2'},
    ])

    const currentState = mockState.get()
    expect(currentState.projectStatus['__all__']).toMatchObject({
      isPending: false,
      initialLoadComplete: true,
    })
    expect(currentState.projectStatus['proj-1']).toMatchObject({
      isPending: false,
      initialLoadComplete: true,
    })
  })

  it('forces refetch if forceRefetch = true', async () => {
    const existingProjects: SanityProject[] = [
      {id: 'old-proj', displayName: 'Old Project'} as SanityProject,
    ]
    mockState.set('', {
      projects: existingProjects,
      projectStatus: {
        __all__: {isPending: false, initialLoadComplete: true},
      },
    })

    const result = await getProjects(actionContext, true)

    expect(getGlobalClient).toHaveBeenCalled()
    expect(result).toEqual([
      {id: 'proj-1', displayName: 'Project 1'},
      {id: 'proj-2', displayName: 'Project 2'},
    ])
  })

  it('handles errors and sets error state', async () => {
    ;(getGlobalClient as Mock).mockImplementation(() => ({
      projects: {
        list: vi.fn(async () => {
          throw new Error('Fetch failed')
        }),
      },
    }))

    await expect(getProjects(actionContext)).rejects.toThrow('Fetch failed')

    const stateAfterError = mockState.get()
    expect(stateAfterError.projectStatus['__all__']).toMatchObject({
      isPending: false,
      error: new Error('Fetch failed'),
      initialLoadComplete: false,
    })
  })
})
