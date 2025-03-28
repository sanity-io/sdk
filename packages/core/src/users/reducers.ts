import {omit} from 'lodash-es'

import {type SanityInstance} from '../store/createSanityInstance'
import {type GetUsersOptions, type SanityUserResponse, type UsersStoreState} from './types'
import {DEFAULT_USERS_BATCH_SIZE} from './usersConstants'

/** @internal */
export const getUsersKey = (
  instance: SanityInstance,
  {
    resourceType,
    organizationId,
    batchSize = DEFAULT_USERS_BATCH_SIZE,
    projectId = instance.config.projectId,
  }: GetUsersOptions = {},
): string =>
  JSON.stringify({resourceType, organizationId, batchSize, projectId} satisfies ReturnType<
    typeof parseUsersKey
  >)

/** @internal */
export const parseUsersKey = (
  key: string,
): {
  batchSize: number
  resourceType?: 'organization' | 'project'
  projectId?: string
  organizationId?: string
} => JSON.parse(key)

export const addSubscription =
  (subscriptionId: string, key: string) =>
  (prev: UsersStoreState): UsersStoreState => {
    const group = prev.users[key]
    const subscriptions = [...(group?.subscriptions ?? []), subscriptionId]
    return {...prev, users: {...prev.users, [key]: {...group, subscriptions}}}
  }

export const removeSubscription =
  (subscriptionId: string, key: string) =>
  (prev: UsersStoreState): UsersStoreState => {
    const group = prev.users[key]
    if (!group) return prev
    const subscriptions = group.subscriptions.filter((id) => id !== subscriptionId)
    if (!subscriptions.length) return {...prev, users: omit(prev.users, key)}
    return {...prev, users: {...prev.users, [key]: {...group, subscriptions}}}
  }

export const setUsersData =
  (key: string, {data, nextCursor, totalCount}: SanityUserResponse) =>
  (prev: UsersStoreState): UsersStoreState => {
    const group = prev.users[key]
    if (!group) return prev
    const users = [...(group.users ?? []), ...data]
    return {...prev, users: {...prev.users, [key]: {...group, users, totalCount, nextCursor}}}
  }

export const updateLastLoadMoreRequest =
  (timestamp: string, key: string) =>
  (prev: UsersStoreState): UsersStoreState => {
    const group = prev.users[key]
    if (!group) return prev
    return {...prev, users: {...prev.users, [key]: {...group, lastLoadMoreRequest: timestamp}}}
  }

export const setUsersError =
  (key: string, error: unknown) =>
  (prev: UsersStoreState): UsersStoreState => {
    const group = prev.users[key]
    if (!group) return prev
    return {...prev, users: {...prev.users, [key]: {...group, error}}}
  }

export const cancelRequest =
  (key: string) =>
  (prev: UsersStoreState): UsersStoreState => {
    const group = prev.users[key]
    if (!group) return prev
    if (group.subscriptions.length) return prev
    return {...prev, users: omit(prev.users, key)}
  }

export const initializeRequest =
  (key: string) =>
  (prev: UsersStoreState): UsersStoreState => {
    if (prev.users[key]) return prev
    return {...prev, users: {...prev.users, [key]: {subscriptions: []}}}
  }
