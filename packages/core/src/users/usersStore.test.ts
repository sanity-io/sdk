import {type ResourceType, type User} from '@sanity/access-api'
import {firstValueFrom} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClient} from '../client/clientStore'
import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {createUsersStore, type UsersStoreState} from './usersStore'

vi.mock('../client/clientStore', () => ({
  getClient: vi.fn().mockReturnValue({
    request: vi.fn().mockImplementation(() => ({
      data: [],
      totalCount: 0,
      nextCursor: null,
    })),
  }),
}))

describe('resource initialization', () => {
  it('should have correct default initial state', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'test', dataset: 'test'}],
    })
    const defaultState = createUsersStore(instance)

    expect(defaultState.getState().getCurrent()).toEqual({
      users: [],
      totalCount: 0,
      nextCursor: null,
      hasMore: false,
      initialFetchCompleted: false,
      options: {
        resourceType: '',
        resourceId: '',
        limit: 100,
      },
    })
  })
})

describe('usersStore', () => {
  let state: ResourceState<UsersStoreState>
  let instance: ReturnType<typeof createSanityInstance>

  beforeEach(() => {
    instance = createSanityInstance({
      resources: [{projectId: 'test', dataset: 'test'}],
    })
    state = createResourceState<UsersStoreState>(
      {
        users: [],
        totalCount: 0,
        nextCursor: null,
        hasMore: false,
        initialFetchCompleted: false,
        options: {
          resourceType: 'organization',
          resourceId: 'org123',
          limit: 100,
        },
      },
      {name: 'users'},
    )
  })

  describe('getState', () => {
    it('should return initial state', async () => {
      const store = createUsersStore({state, instance})
      const state$ = store.getState().observable

      await expect(firstValueFrom(state$)).resolves.toEqual({
        users: [],
        totalCount: 0,
        nextCursor: null,
        hasMore: false,
        initialFetchCompleted: false,
        options: {
          resourceType: 'organization',
          resourceId: 'org123',
          limit: 100,
        },
      })
    })

    it('should return resolved users', async () => {
      const mockUsers = [{profile: {id: '1', displayName: 'Test User'}}] as unknown as User[]
      state.set('resolveUsers', {
        users: mockUsers,
        totalCount: 1,
        nextCursor: null,
        hasMore: false,
        initialFetchCompleted: true,
      })

      const store = createUsersStore({state, instance})
      const state$ = store.getState().observable

      await expect(firstValueFrom(state$)).resolves.toMatchObject({
        users: mockUsers,
        totalCount: 1,
        initialFetchCompleted: true,
      })
    })
  })

  describe('resolveUsers', () => {
    it('should fetch and store users', async () => {
      const mockResponse = {
        data: [{profile: {id: '1'}}] as User[],
        totalCount: 1,
        nextCursor: 'cursor123',
      }
      vi.mocked(getClient(instance, {apiVersion: 'vX'}).request).mockResolvedValueOnce(mockResponse)

      const store = createUsersStore({state, instance})
      const result = await store.resolveUsers()

      expect(result).toEqual(mockResponse)
      expect(state.get()).toMatchObject({
        users: mockResponse.data,
        totalCount: mockResponse.totalCount,
        nextCursor: mockResponse.nextCursor,
        initialFetchCompleted: true,
      })
    })

    it('should throw error when missing resource info', async () => {
      state.set('options', {options: {resourceType: '' as ResourceType, resourceId: ''}})
      const store = createUsersStore({state, instance})

      await expect(store.resolveUsers()).rejects.toThrow(
        'Resource type and ID are required to resolve users',
      )
    })
  })

  describe('loadMore', () => {
    it('should fetch and append more users', async () => {
      const initialUsers = Array(10).fill({profile: {id: '1'}}) as User[]
      const newUsers = Array(5).fill({profile: {id: '2'}}) as User[]

      state.set('resolveUsers', {
        users: initialUsers,
        totalCount: 15,
        nextCursor: 'cursor123',
        hasMore: true,
        initialFetchCompleted: true,
      })

      vi.mocked(getClient(instance, {apiVersion: 'xV'}).request).mockResolvedValueOnce({
        data: newUsers,
        totalCount: 15,
        nextCursor: null,
      })

      const store = createUsersStore({state, instance})
      await store.loadMore()

      expect(state.get()).toMatchObject({
        users: [...initialUsers, ...newUsers],
        totalCount: 15,
        nextCursor: null,
        hasMore: false,
      })
    })

    it('should throw error when missing resource info', async () => {
      state.set('options', {options: {resourceType: '' as ResourceType, resourceId: ''}})
      const store = createUsersStore({state, instance})

      await expect(store.loadMore()).rejects.toThrow(
        'Resource type and ID are required to load more users',
      )
    })
  })

  describe('setOptions', () => {
    it('should update resource options', () => {
      const store = createUsersStore({state, instance})
      store.setOptions({
        resourceType: 'project',
        resourceId: 'proj456',
      })

      expect(state.get().options).toMatchObject({
        resourceType: 'project',
        resourceId: 'proj456',
      })
    })

    it('should reset state when options change', () => {
      const store = createUsersStore({state, instance})
      store.setOptions({
        resourceType: 'project',
        resourceId: 'proj456',
      })

      expect(state.get()).toMatchObject({
        users: [],
        totalCount: 0,
        nextCursor: null,
        hasMore: false,
        initialFetchCompleted: false,
      })
    })

    it('should preserve existing limit when updating options', () => {
      const store = createUsersStore({state, instance})
      store.setOptions({
        resourceType: 'project',
        resourceId: 'proj456',
      })

      expect(state.get().options).toMatchObject({
        resourceType: 'project',
        resourceId: 'proj456',
        limit: 100, // Preserves original limit from initial state
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty response', async () => {
      vi.mocked(getClient(instance, {apiVersion: 'vX'}).request).mockResolvedValueOnce({
        data: [],
        totalCount: 0,
        nextCursor: null,
      })

      const store = createUsersStore({state, instance})
      await store.resolveUsers()

      expect(state.get()).toMatchObject({
        users: [],
        totalCount: 0,
        initialFetchCompleted: true,
      })
    })

    it('should handle no more results', async () => {
      state.set('resolveUsers', {
        users: Array(10).fill({}),
        totalCount: 10,
        nextCursor: null,
        hasMore: false,
        initialFetchCompleted: true,
      })

      const store = createUsersStore({state, instance})
      await store.loadMore()

      // Shouldn't change state
      expect(state.get().users.length).toBe(10)
    })
  })
})
