import type {SanityInstance} from '../instance/types'
import type {User} from './types'
import {getUserStore} from './userStore'

/**
 * Gets a list of users by id
 *
 * @param userIds - The ids of the users to get
 * @param instance - The instance to get the users from
 * @returns A promise that resolves to the users, in the same order as the input
 * @public
 */
export function getUsers(userIds: string[], instance: SanityInstance): Promise<User[]> {
  return getUserStore(instance).getUsers(userIds)
}

/**
 * Gets a user by id
 *
 * @param userId - The id of the user to get
 * @param instance - The instance to get the user from
 * @returns A promise that resolves to the user
 * @public
 */
export async function getUser(userId: string, instance: SanityInstance): Promise<User> {
  const [user] = await getUsers([userId], instance)
  return user
}
