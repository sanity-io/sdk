import {type ResourceType, type User} from '@sanity/access-api'
import {createSelector} from 'reselect'

import {getClient} from '../client/clientStore'
import {type SanityInstance} from '../instance/types'
import {createAction} from '../resources/createAction'
import {createResource} from '../resources/createResource'
import {createStateSourceAction} from '../resources/createStateSourceAction'
import {createStore} from '../resources/createStore'

const API_VERSION = 'xV'

/**
 * @public
 */
export interface SanityUserResponse {
  data: User[]
  totalCount: number
  nextCursor: string | null
}

/**
 * @public
 */
export interface UsersStoreState {
  users: User[]
  totalCount: number
  nextCursor: string | null
  hasMore: boolean
  initialFetchCompleted: boolean
  options: {
    resourceType: ResourceType
    resourceId: string
    /**
     * The maximum number of users to fetch. [Default: 100]
     */
    limit?: number
  }
}

/**
 * @internal
 */
const usersStore = createResource<UsersStoreState>({
  name: 'users',
  getInitialState: () => ({
    users: [],
    totalCount: 0,
    nextCursor: null,
    hasMore: false,
    initialFetchCompleted: false,
    options: {
      resourceType: '' as ResourceType,
      resourceId: '',
      limit: 100,
    },
  }),
  initialize() {
    return () => {}
  },
})

/**
 * @public
 */
const getState = createStateSourceAction(
  usersStore,
  createSelector(
    [
      (state: UsersStoreState) => state.users,
      (state: UsersStoreState) => state.totalCount,
      (state: UsersStoreState) => state.nextCursor,
      (state: UsersStoreState) => state.hasMore,
      (state: UsersStoreState) => state.initialFetchCompleted,
      (state: UsersStoreState) => state.options,
    ],
    (users, totalCount, nextCursor, hasMore, initialFetchCompleted, options) => ({
      users,
      totalCount,
      nextCursor,
      hasMore,
      options,
      initialFetchCompleted,
    }),
  ),
)

interface FetchUsersParams {
  resourceType: 'organization' | 'project'
  resourceId: string
  nextCursor?: string | null
  limit?: number
}

/**
 * @internal
 */
const fetchUsers = (instance: SanityInstance, params: FetchUsersParams) => {
  const {resourceType, resourceId, nextCursor, limit = 100} = params
  const client = getClient(instance, {scope: 'global', apiVersion: API_VERSION})

  return client.request<SanityUserResponse>({
    method: 'GET',
    uri: `access/${resourceType}/${resourceId}/users`,
    query: nextCursor ? {nextCursor, limit: limit.toString()} : {limit: limit.toString()},
  })
}

const loadMore = createAction(usersStore, ({state, instance}) => {
  return async function () {
    const {users, nextCursor, options} = state.get()
    const {resourceType, resourceId, limit} = options

    if (!resourceType || !resourceId) {
      throw new Error('Resource type and ID are required to load more users')
    }

    const response = await fetchUsers(instance, {resourceType, resourceId, nextCursor, limit})

    const allUsers = [...users, ...response.data]
    const hasMore = allUsers.length < response.totalCount

    state.set('loadMore', {
      users: allUsers,
      totalCount: response.totalCount,
      nextCursor: response.nextCursor,
      hasMore,
    })
  }
})

const resolveUsers = createAction(usersStore, ({state, instance}) => {
  return async function () {
    const {options} = state.get()
    const {resourceType, resourceId, limit} = options

    if (!resourceType || !resourceId) {
      throw new Error('Resource type and ID are required to resolve users')
    }

    const response = await fetchUsers(instance, {resourceType, resourceId, limit})

    const hasMore = response.data.length < response.totalCount

    state.set('resolveUsers', {
      users: response.data,
      totalCount: response.totalCount,
      nextCursor: response.nextCursor,
      hasMore,
      initialFetchCompleted: true,
    })

    return response
  }
})

const setOptions = createAction(usersStore, ({state}) => {
  return function (options: {resourceType: 'organization' | 'project'; resourceId: string}) {
    state.set('options', {
      ...state.get(),
      options: {
        ...state.get().options,
        resourceType: options.resourceType,
        resourceId: options.resourceId,
      },
    })
  }
})

/**
 * @public
 */
export const createUsersStore = createStore(usersStore, {
  getState,
  loadMore,
  resolveUsers,
  setOptions,
})
