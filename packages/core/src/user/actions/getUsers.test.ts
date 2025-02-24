import {type SanityUser} from '@sanity/client'
import {type Observable, type Operator} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {type ActionContext} from '../../resources/createAction'
import {type ResourceState} from '../../resources/createResource'
import {type UserState} from '../userStore'
import {getUsers} from './getUsers'

vi.mock('../../client/actions/getGlobalClient', () => ({
  getGlobalClient: vi.fn(),
}))

function createMockResourceState(initial: UserState): ResourceState<UserState> {
  let store = structuredClone(initial)
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
      lift: function <R>(_operator?: Operator<UserState, R>): Observable<R> {
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

describe('getUsers', () => {
  let mockState: ResourceState<UserState>
  let actionContext: ActionContext<UserState>

  beforeEach(() => {
    vi.resetAllMocks()

    mockState = createMockResourceState({
      users: [],
      userStatus: {},
    })

    actionContext = {
      state: mockState,
      instance: {
        identity: {
          id: 'fake-user-id',
          projectId: 'fake-project-id',
          dataset: 'fake-dataset',
        },
        config: {
          auth: {
            token: 'fake-token',
          },
        },
        dispose: vi.fn(),
      },
    }
    ;(getGlobalClient as Mock).mockImplementation(() => ({
      users: {
        getById: vi.fn(async (ids: string) => {
          return ids.split(',').map((id) => ({
            id,
            displayName: `User ${id}`,
          })) as SanityUser[]
        }),
      },
    }))
  })

  it.skip('returns cached users if they already exist and are not pending', async () => {
    const existingUsers: SanityUser[] = [
      {
        id: 'user-1',
        displayName: 'User user-1',
        projectId: 'fake-project-id',
        familyName: null,
        givenName: null,
        middleName: null,
        imageUrl: null,
        createdAt: '',
        updatedAt: '',
        isCurrentUser: false,
      },
      {
        id: 'user-2',
        displayName: 'User user-2',
        projectId: 'fake-project-id',
        familyName: null,
        givenName: null,
        middleName: null,
        imageUrl: null,
        createdAt: '',
        updatedAt: '',
        isCurrentUser: false,
      },
    ]
    mockState.set('', {
      users: existingUsers,
      userStatus: {
        'user-1': {isPending: false, initialLoadComplete: true},
        'user-2': {isPending: false, initialLoadComplete: true},
      },
    })

    const result = await getUsers(actionContext, ['user-1', 'user-2'])
    expect(result).toEqual(existingUsers)
    expect(getGlobalClient).not.toHaveBeenCalled()
  })

  it.skip('returns existing users if they are pending', async () => {
    const pendingUsers: SanityUser[] = [
      {id: 'user-1', displayName: 'Placeholder 1'} as SanityUser,
      {id: 'user-2', displayName: 'Placeholder 2'} as SanityUser,
    ]

    mockState.set('', {
      users: pendingUsers,
      userStatus: {
        'user-1': {isPending: true},
        'user-2': {isPending: true},
      },
    })

    const result = await getUsers(actionContext, ['user-1', 'user-2'])
    expect(result).toEqual(pendingUsers)
    expect(getGlobalClient).not.toHaveBeenCalled()
  })

  it('fetches users if not in store and updates state', async () => {
    const result = await getUsers(actionContext, ['user-3', 'user-4'])
    expect(getGlobalClient).toHaveBeenCalled()

    expect(result).toEqual([
      {id: 'user-3', displayName: 'User user-3'},
      {id: 'user-4', displayName: 'User user-4'},
    ])

    const currentState = mockState.get()
    expect(currentState.users).toHaveLength(2)
    expect(currentState.userStatus['user-3']).toMatchObject({
      isPending: false,
      initialLoadComplete: true,
    })
    expect(currentState.userStatus['user-4']).toMatchObject({
      isPending: false,
      initialLoadComplete: true,
    })
  })

  it('forces refetch if forceRefetch = true', async () => {
    const existingUsers: SanityUser[] = [
      {id: 'user-5', displayName: 'Old Data 1'} as SanityUser,
      {id: 'user-6', displayName: 'Old Data 2'} as SanityUser,
    ]

    mockState.set('', {
      users: existingUsers,
      userStatus: {
        'user-5': {isPending: false, initialLoadComplete: true},
        'user-6': {isPending: false, initialLoadComplete: true},
      },
    })

    const result = await getUsers(actionContext, ['user-5', 'user-6'], true)
    expect(getGlobalClient).toHaveBeenCalled()

    expect(result).toEqual([
      {id: 'user-5', displayName: 'User user-5'},
      {id: 'user-6', displayName: 'User user-6'},
    ])

    const currentState = mockState.get()
    expect(currentState.users).toEqual([
      {id: 'user-5', displayName: 'User user-5'},
      {id: 'user-6', displayName: 'User user-6'},
    ])
  })

  it.skip('handles errors and sets error state', async () => {
    ;(getGlobalClient as Mock).mockImplementation(() => ({
      users: {
        getById: vi.fn(async () => {
          throw new Error('Fetch failed')
        }),
      },
    }))

    await expect(getUsers(actionContext, ['bad-id-1', 'bad-id-2'])).rejects.toThrow('Fetch failed')

    const stateAfterError = mockState.get()
    expect(stateAfterError.userStatus['bad-id-1']).toMatchObject({
      isPending: false,
      error: new Error('Fetch failed'),
      initialLoadComplete: false,
    })
    expect(stateAfterError.userStatus['bad-id-2']).toMatchObject({
      isPending: false,
      error: new Error('Fetch failed'),
      initialLoadComplete: false,
    })
  })
})
