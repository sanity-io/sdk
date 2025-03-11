import {omit} from 'lodash-es'

import {type ResourceId} from '../document/patchOperations'
import {
  type GetUsersOptions,
  type ResourceType,
  type SanityUserResponse,
  type UsersStoreState,
} from './types'
import {DEFAULT_USERS_LIMIT} from './usersConstants'

/** @internal */
export const getUsersKey = ({
  resourceId,
  resourceType,
  limit = DEFAULT_USERS_LIMIT,
}: GetUsersOptions): string => JSON.stringify({resourceType, resourceId, limit})
/** @internal */
export const parseUsersKey = (
  key: string,
): {resourceType: ResourceType; resourceId: string | ResourceId; limit: number} => JSON.parse(key)

export const addSubscription =
  (subscriptionId: string, options: GetUsersOptions) =>
  (prev: UsersStoreState): UsersStoreState => {
    const key = getUsersKey(options)
    const group = prev.users[key]
    const subscriptions = [...(group?.subscriptions ?? []), subscriptionId]
    return {...prev, users: {...prev.users, [key]: {...group, subscriptions}}}
  }

export const removeSubscription =
  (subscriptionId: string, options: GetUsersOptions) =>
  (prev: UsersStoreState): UsersStoreState => {
    const key = getUsersKey(options)
    const group = prev.users[key]
    if (!group) return prev
    const subscriptions = group.subscriptions.filter((id) => id !== subscriptionId)
    if (!subscriptions.length) return {...prev, users: omit(prev.users, key)}
    return {...prev, users: {...prev.users, [key]: {...group, subscriptions}}}
  }

export const setUsersData =
  (options: GetUsersOptions, {data, nextCursor, totalCount}: SanityUserResponse) =>
  (prev: UsersStoreState): UsersStoreState => {
    const key = getUsersKey(options)
    const group = prev.users[key]
    if (!group) return prev
    const users = [...(group.users ?? []), ...data]
    return {...prev, users: {...prev.users, [key]: {...group, users, totalCount, nextCursor}}}
  }

export const updateLastLoadMoreRequest =
  (timestamp: string, options: GetUsersOptions) =>
  (prev: UsersStoreState): UsersStoreState => {
    const key = getUsersKey(options)
    const group = prev.users[key]
    if (!group) return prev
    return {...prev, users: {...prev.users, [key]: {...group, lastLoadMoreRequest: timestamp}}}
  }

export const setUsersError =
  (options: GetUsersOptions, error: unknown) =>
  (prev: UsersStoreState): UsersStoreState => {
    const key = getUsersKey(options)
    const group = prev.users[key]
    if (!group) return prev
    return {...prev, users: {...prev.users, [key]: {...group, error}}}
  }

export const cancelRequest =
  (options: GetUsersOptions) =>
  (prev: UsersStoreState): UsersStoreState => {
    const key = getUsersKey(options)
    const group = prev.users[key]
    if (!group) return prev
    if (group.subscriptions.length) return prev
    return {...prev, users: omit(prev.users, key)}
  }

export const initializeRequest =
  (options: GetUsersOptions) =>
  (prev: UsersStoreState): UsersStoreState => {
    const key = getUsersKey(options)
    if (prev.users[key]) return prev
    return {...prev, users: {...prev.users, [key]: {subscriptions: []}}}
  }
