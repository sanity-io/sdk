import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {
  createStore,
  type CurriedActions,
  type StoreActionContext,
  type StoreActionMap,
} from '../store/createStore'
import {fetchUsers} from './fetchUsers'
import type {User} from './types'

type UserStoreState = {
  users: Record<string, User>
}

const INITIAL_STATE: UserStoreState = {
  users: {},
}

const ACTIONS = {
  /**
   * Get users from store, fetching missing ones and filling cache
   *
   * @param context - Store context
   * @param userIds - Array of user IDs to fetch
   * @returns A promise that resolves to an array of users, in the same order as IDs were given
   */
  async getUsers(
    {store, instance}: StoreActionContext<UserStoreState>,
    userIds: string[],
  ): Promise<User[]> {
    // Check which ones already exist
    const {users} = store.getState()
    const missingIds: string[] = []
    const existingUsers: User[] = []

    for (const id of userIds) {
      if (users[id]) {
        existingUsers.push(users[id])
      } else {
        missingIds.push(id)
      }
    }

    if (missingIds.length === 0) {
      return existingUsers
    }

    const newUsers = await fetchUsers(missingIds, instance)

    // Persist the users back to the store
    const indexed = indexById(newUsers)
    store.setState(({users: prevUsers}) => ({users: {...prevUsers, ...indexed}}))

    // Return users in the same order as they were requested
    const allUsers: User[] = []
    for (const id of userIds) {
      allUsers.push(users[id] || indexed[id])
    }

    return allUsers
  },
} satisfies StoreActionMap<UserStoreState>

/**
 * Gets the user store for a given SDK instance
 *
 * @param instance - SDK instance to get user store for
 * @returns The user store
 * @internal
 */
export function getUserStore(
  instance: SanityInstance,
): CurriedActions<UserStoreState, typeof ACTIONS> {
  return getOrCreateResource(instance, 'userStore', () =>
    createStore({...INITIAL_STATE}, ACTIONS, {name: 'users', instance}),
  )
}

function indexById(users: User[]) {
  const indexed: Record<string, User> = {}
  for (const user of users) {
    indexed[user.id] = user
  }
  return indexed
}
