import {type SanityUser} from '@sanity/client'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {createAction} from '../../resources/createAction'
import {userStore} from '../userStore'

/**
 * Fetches a list of Sanity users.
 *
 * @public
 *
 * @param forceRefetch - When true, bypasses the cache and fetches fresh data from the API
 * @returns Promise that resolves to an array of Sanity users
 *
 * @throws Error When the API request fails
 */
export const getUsers = createAction(
  userStore,
  ({state, instance}) =>
    async (userIds: string[], forceRefetch = false): Promise<SanityUser[]> => {
      const {users, userStatus} = state.get()

      // Return existing users if we have them, they're not loading, and we're not forcing a refetch
      const existingUsers = users.filter((user) => userIds.includes(user.id))
      const existingUserStatus = Object.fromEntries(
        Object.entries(userStatus).filter(([key]) => userIds.includes(key)),
      )

      // If we're already loading users, return the current list
      if (existingUserStatus['isPending'] && !forceRefetch) {
        return existingUsers
      }

      // Set loading state
      state.set('usersRequested', {
        userStatus: {
          ...state.get().userStatus,
          ...existingUserStatus,
        },
      })

      try {
        const client = getGlobalClient(instance)
        const usersResponse = (await client.users.getById(
          userIds.join(','),
        )) as unknown as SanityUser[]

        // Create status entries for each user
        const newUserStatus = usersResponse.reduce(
          (
            acc: Record<string, {isPending: boolean; error?: Error; initialLoadComplete: boolean}>,
            user: SanityUser,
          ) => {
            acc[user.id] = {
              isPending: false,
              initialLoadComplete: true,
            }
            return acc
          },
          {} as Record<string, {isPending: boolean; error?: Error; initialLoadComplete: boolean}>,
        )

        state.set('usersLoaded', {
          users: usersResponse,
          userStatus: newUserStatus,
        })

        return usersResponse
      } catch (err) {
        // Update error state
        state.set('usersRequestError', {
          userStatus: {
            ...state.get().userStatus,
            ...existingUserStatus,
          },
        })
        throw err
      }
    },
)
