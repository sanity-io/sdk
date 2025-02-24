/* eslint-disable @typescript-eslint/no-explicit-any */
// getProject.test.ts
import {type SanityUser} from '@sanity/client'
import {type Observable, type Operator} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {type ActionContext} from '../../resources/createAction'
import {type ResourceState} from '../../resources/createResource'
import {type UserState} from '../userStore'
import {getUser} from './getUser'

// Mock getGlobalClient so we can provide a fake client implementation
vi.mock('../../client/actions/getGlobalClient', () => ({
  getGlobalClient: vi.fn(),
}))

// Helper to create a mock ResourceState<ProjectState> without using "as any"
function createMockResourceState(initial: UserState): ResourceState<UserState> {
  let store = structuredClone(initial) // create a clone to avoid shared mutations
  return {
    get: () => store,
    set: (
      _actionName: string,
      stateOrUpdater: Partial<UserState> | ((s: UserState) => Partial<UserState>),
    ) => {
      const payload = typeof stateOrUpdater === 'function' ? stateOrUpdater(store) : stateOrUpdater
      store = {...store, ...payload}
      if (payload.userStatus) {
        store.userStatus = {...store.userStatus, ...payload.userStatus}
      }
      if (payload.users) {
        store.users = payload.users
      }
    },
    observable: {
      subscribe: vi.fn(),
      source: undefined,
      operator: undefined,
      lift: function <R>(_operator?: Operator<UserState, R> | undefined): Observable<R> {
        throw new Error('Function not implemented.')
      },
      forEach: function (_next: (value: UserState) => void): Promise<void> {
        throw new Error('Function not implemented.')
      },
      pipe: function (): Observable<UserState> {
        throw new Error('Function not implemented.')
      },
      toPromise: function (): Promise<UserState | undefined> {
        throw new Error('Function not implemented.')
      },
    },
  }
}

describe('getUser', () => {
  let mockState: ResourceState<UserState>
  let actionContext: ActionContext<UserState>

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()

    // Create a fresh mock store
    mockState = createMockResourceState({
      users: [],
      userStatus: {},
    })

    // We'll use a fake "instance" object for the ActionContext
    actionContext = {
      instance: {token: 'fake-token'} as any, // It's often safe to pass partial instance
      state: mockState,
    }

    // By default, mock the global client to return a simple dummy
    ;(getGlobalClient as Mock).mockImplementation(() => ({
      users: {
        getById: vi.fn(async (id: string) => {
          return {id, displayName: `User ${id}`} as SanityUser
        }),
      },
    }))
  })

  it('returns cached project if it already exists and is not pending', async () => {
    // Seed the mock store with an existing project
    const existingUser: SanityUser = {
      id: 'user-1',
      projectId: '',
      displayName: '',
      familyName: null,
      givenName: null,
      middleName: null,
      imageUrl: null,
      createdAt: '',
      updatedAt: '',
      isCurrentUser: false,
    }
    mockState.set('', {
      users: [existingUser],
      userStatus: {
        'user-1': {isPending: false, initialLoadComplete: true},
      },
    })

    const result = await getUser(actionContext, 'user-1')
    expect(result).toEqual(existingUser)

    // Ensure we did NOT fetch from the global client
    expect(getGlobalClient).not.toHaveBeenCalled()
  })

  it('returns a loading placeholder if the project is currently pending', async () => {
    // Seed the mock store with a pending state
    mockState.set('', {
      users: [{id: 'user-2', displayName: 'Placeholder'} as SanityUser],
      userStatus: {'user-2': {isPending: true}},
    })

    const result = await getUser(actionContext, 'user-2')
    expect(result).toEqual({id: 'user-2', displayName: 'Placeholder'})
    expect(getGlobalClient).not.toHaveBeenCalled()
  })

  it('fetches project if not in store, and updates state', async () => {
    const result = await getUser(actionContext, 'user-3')
    // Check that we actually fetched from the global client
    expect(getGlobalClient).toHaveBeenCalled()

    // The returned project should be the mock from getGlobalClient
    expect(result).toEqual({id: 'user-3', displayName: 'User user-3'})

    // Verify the store got updated
    const currentState = mockState.get()
    expect(currentState.users).toMatchObject([{id: 'user-3'}])
    expect(currentState.userStatus['user-3']).toMatchObject({
      isPending: false,
      initialLoadComplete: true,
    })
  })

  it('forces refetch if forceRefetch = true', async () => {
    // Seed the store with a project, but isPending=false
    const existingUser: SanityUser = {
      id: 'user-4',
      projectId: '',
      displayName: 'Old Data',
      familyName: null,
      givenName: null,
      middleName: null,
      imageUrl: null,
      createdAt: '',
      updatedAt: '',
      isCurrentUser: false,
    }
    mockState.set('', {
      users: [existingUser],
      userStatus: {'user-4': {isPending: false, initialLoadComplete: true}},
    })

    // Now call getProject with forceRefetch
    const result = await getUser(actionContext, 'user-4', true)
    // Should fetch from the global client
    expect(getGlobalClient).toHaveBeenCalled()

    // Check we got fresh data from the mock getGlobalClient
    expect(result).toEqual({id: 'user-4', displayName: 'User user-4'})

    // Check store is updated with new data
    const currentState = mockState.get()
    expect(currentState.users).toEqual([{id: 'user-4', displayName: 'User user-4'}])
  })

  it('handles errors and sets error state', async () => {
    // Make the global client throw
    ;(getGlobalClient as Mock).mockImplementation(() => ({
      users: {
        getById: vi.fn(async () => {
          throw new Error('Fetch failed')
        }),
      },
    }))

    // We must catch the error from getProject
    await expect(getUser(actionContext, 'bad-id')).rejects.toThrow('Fetch failed')

    // Check the store got an error state for 'bad-id'
    const stateAfterError = mockState.get()
    expect(stateAfterError.userStatus['bad-id']).toMatchObject({
      isPending: false,
      error: new Error('Fetch failed'),
      initialLoadComplete: false,
    })
  })
})
