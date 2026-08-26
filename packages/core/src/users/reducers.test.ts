import {describe, expect, it} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {
  addSubscription,
  cancelRequest,
  getUsersKey,
  initializeRequest,
  parseUsersKey,
  removeSubscription,
  setUsersData,
  setUsersError,
  updateLastLoadMoreRequest,
} from './reducers'
import {type GetUsersOptions, type SanityUserResponse, type UsersStoreState} from './types'
import {DEFAULT_USERS_BATCH_SIZE} from './usersConstants'

describe('Users Reducers', () => {
  // Mock SanityInstance for testing
  const mockInstance: SanityInstance = {
    instanceId: 'test-instance-id',
    config: {
      projectId: 'test-project-id',
    },
    isDisposed: () => false,
    dispose: () => {},
    onDispose: () => () => {},
    getParent: () => undefined,
    createChild: (_config) => mockInstance,
    match: () => undefined,
  }

  const sampleOptions: GetUsersOptions = {
    resourceType: 'project',
    projectId: 'proj123',
    batchSize: 50,
  }

  const sampleOptionsWithDefaultBatchSize: GetUsersOptions = {
    resourceType: 'project',
    projectId: 'proj123',
  }

  describe('getUsersKey', () => {
    it('should generate a key based on resourceType, resourceId and batchSize', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      expect(JSON.parse(key)).toEqual({
        resourceType: 'project',
        projectId: 'proj123',
        batchSize: 50,
      })
    })

    it('should use DEFAULT_USERS_BATCH_SIZE when batchSize is not provided', () => {
      const key = getUsersKey(mockInstance, sampleOptionsWithDefaultBatchSize)
      expect(JSON.parse(key)).toEqual({
        resourceType: 'project',
        projectId: 'proj123',
        batchSize: DEFAULT_USERS_BATCH_SIZE,
      })
    })
  })

  describe('parseUsersKey', () => {
    it('should parse a key back into its components', () => {
      const key = JSON.stringify({
        resourceType: 'organization',
        resourceId: 'org456',
        batchSize: 25,
      })
      const parsed = parseUsersKey(key)
      expect(parsed).toEqual({
        resourceType: 'organization',
        resourceId: 'org456',
        batchSize: 25,
      })
    })
  })

  describe('addSubscription', () => {
    it('should add a subscription when key does not exist', () => {
      const state: UsersStoreState = {users: {}}
      const key = getUsersKey(mockInstance, sampleOptions)
      const reducer = addSubscription('sub1', key)
      const newState = reducer(state)
      expect(newState.users[key]).toEqual({subscriptions: ['sub1']})
    })

    it('should append subscription when key exists', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const state: UsersStoreState = {users: {[key]: {subscriptions: ['subA']}}}
      const reducer = addSubscription('subB', key)
      const newState = reducer(state)
      expect(newState.users[key]).toEqual({subscriptions: ['subA', 'subB']})
    })
  })

  describe('removeSubscription', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: UsersStoreState = {users: {}}
      const key = getUsersKey(mockInstance, sampleOptions)
      const reducer = removeSubscription('subX', key)
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should remove subscription and keep the group if other subscriptions remain', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const state: UsersStoreState = {users: {[key]: {subscriptions: ['sub1', 'sub2']}}}
      const reducer = removeSubscription('sub1', key)
      const newState = reducer(state)
      expect(newState.users[key]).toEqual({subscriptions: ['sub2']})
    })

    it('should remove the group if no subscriptions remain after removal', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const state: UsersStoreState = {users: {[key]: {subscriptions: ['onlySub']}}}
      const reducer = removeSubscription('onlySub', key)
      const newState = reducer(state)
      expect(newState.users).not.toHaveProperty(key)
    })
  })

  describe('setUsersData', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: UsersStoreState = {users: {}}
      const key = getUsersKey(mockInstance, sampleOptions)
      const userResponse: SanityUserResponse = {
        data: [
          {
            sanityUserId: 'user1',
            profile: {
              id: 'profile1',
              displayName: 'User One',
              email: 'user1@example.com',
              provider: 'google',
              createdAt: '2023-01-01',
            },
            memberships: [],
          },
        ],
        totalCount: 1,
        nextCursor: null,
      }
      const reducer = setUsersData(key, userResponse)
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should set users data if key exists', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const state: UsersStoreState = {users: {[key]: {subscriptions: ['sub1']}}}
      const userResponse: SanityUserResponse = {
        data: [
          {
            sanityUserId: 'user1',
            profile: {
              id: 'profile1',
              displayName: 'User One',
              email: 'user1@example.com',
              provider: 'google',
              createdAt: '2023-01-01',
            },
            memberships: [],
          },
        ],
        totalCount: 1,
        nextCursor: null,
      }
      const reducer = setUsersData(key, userResponse)
      const newState = reducer(state)
      expect(newState.users[key]).toEqual({
        subscriptions: ['sub1'],
        users: userResponse.data,
        totalCount: 1,
        nextCursor: null,
      })
    })

    it('should append new users to existing users', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const existingUser = {
        sanityUserId: 'user1',
        profile: {
          id: 'profile1',
          displayName: 'User One',
          email: 'user1@example.com',
          provider: 'google',
          createdAt: '2023-01-01',
        },
        memberships: [],
      }
      const newUser = {
        sanityUserId: 'user2',
        profile: {
          id: 'profile2',
          displayName: 'User Two',
          email: 'user2@example.com',
          provider: 'google',
          createdAt: '2023-01-02',
        },
        memberships: [],
      }
      const state: UsersStoreState = {
        users: {
          [key]: {
            subscriptions: ['sub1'],
            users: [existingUser],
          },
        },
      }
      const userResponse: SanityUserResponse = {
        data: [newUser],
        totalCount: 2,
        nextCursor: null,
      }
      const reducer = setUsersData(key, userResponse)
      const newState = reducer(state)
      expect(newState.users[key]).toEqual({
        subscriptions: ['sub1'],
        users: [existingUser, newUser],
        totalCount: 2,
        nextCursor: null,
      })
    })
  })

  describe('updateLastLoadMoreRequest', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: UsersStoreState = {users: {}}
      const key = getUsersKey(mockInstance, sampleOptions)
      const timestamp = '2023-05-15T12:00:00Z'
      const reducer = updateLastLoadMoreRequest(timestamp, key)
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should update lastLoadMoreRequest if key exists', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const state: UsersStoreState = {users: {[key]: {subscriptions: ['sub1']}}}
      const timestamp = '2023-05-15T12:00:00Z'
      const reducer = updateLastLoadMoreRequest(timestamp, key)
      const newState = reducer(state)
      expect(newState.users[key]).toEqual({
        subscriptions: ['sub1'],
        lastLoadMoreRequest: timestamp,
      })
    })
  })

  describe('setUsersError', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: UsersStoreState = {users: {}}
      const key = getUsersKey(mockInstance, sampleOptions)
      const error = new Error('Failed to fetch users')
      const reducer = setUsersError(key, error)
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should set error if key exists', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const state: UsersStoreState = {users: {[key]: {subscriptions: ['sub1']}}}
      const error = new Error('Failed to fetch users')
      const reducer = setUsersError(key, error)
      const newState = reducer(state)
      expect(newState.users[key]).toEqual({
        subscriptions: ['sub1'],
        error,
      })
    })
  })

  describe('cancelRequest', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: UsersStoreState = {users: {}}
      const key = getUsersKey(mockInstance, sampleOptions)
      const reducer = cancelRequest(key)
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should return state unchanged if group has subscriptions', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const state: UsersStoreState = {users: {[key]: {subscriptions: ['sub1']}}}
      const reducer = cancelRequest(key)
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should remove the group if no subscriptions exist', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const state: UsersStoreState = {users: {[key]: {subscriptions: []}}}
      const reducer = cancelRequest(key)
      const newState = reducer(state)
      expect(newState.users).not.toHaveProperty(key)
    })
  })

  describe('initializeRequest', () => {
    it('should return state unchanged if group already exists', () => {
      const key = getUsersKey(mockInstance, sampleOptions)
      const existing = {subscriptions: ['sub1']}
      const state: UsersStoreState = {users: {[key]: existing}}
      const reducer = initializeRequest(key)
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should add the group with empty subscriptions if it does not exist', () => {
      const state: UsersStoreState = {users: {}}
      const key = getUsersKey(mockInstance, sampleOptions)
      const reducer = initializeRequest(key)
      const newState = reducer(state)
      expect(newState.users[key]).toEqual({subscriptions: []})
    })
  })
})
