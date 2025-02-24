import {type SanityUser} from '@sanity/client'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {createAction} from '../../resources/createAction'
import {userStore} from '../userStore'

/**
 * Fetches a Sanity user by their ID, with caching and loading state management.
 *
 * @public
 *
 * @param userId - The ID of the Sanity user to fetch
 * @param forceRefetch - Optional boolean to force a new fetch, ignoring cache. Defaults to false
 * @returns Promise resolving to the Sanity user data
 *
 * @throws Will throw an error if the user fetch fails
 */
export const getUser = createAction(
  userStore,
  ({state, instance}) =>
    async (userId: string, forceRefetch = false): Promise<SanityUser> => {
      const {users, userStatus} = state.get()

      const existing = users.find((u) => u.id === userId)
      const status = userStatus[userId]

      // Return existing user if we have it, it's not loading, and we're not forcing a refetch
      if (existing && status && !status.isPending && !forceRefetch) {
        return existing
      }

      // If we're already loading this user, return the loading placeholder
      if (status?.isPending) {
        return existing || ({id: userId} as unknown as SanityUser)
      }

      // Set loading state
      if (!existing) {
        state.set('userRequested', {
          users: [...users, {id: userId} as unknown as SanityUser],
          userStatus: {
            ...state.get().userStatus,
            [userId]: {
              isPending: true,
              initialLoadComplete: status?.initialLoadComplete || false,
            },
          },
        })
      }

      try {
        const client = getGlobalClient(instance)
        const user = await client.users.getById(userId)

        // Update the user in the store
        state.set('userLoaded', {
          users: existing ? users.map((u) => (u.id === userId ? user : u)) : [...users, user],
          userStatus: {
            ...state.get().userStatus,
            [userId]: {
              isPending: false,
              initialLoadComplete: true,
            },
          },
        })

        return user
      } catch (err) {
        // Update error state
        state.set('userRequestedError', {
          userStatus: {
            ...state.get().userStatus,
            [userId]: {
              isPending: false,
              error: err as Error,
              initialLoadComplete: status?.initialLoadComplete || false,
            },
          },
        })
        throw err
      }
    },
)
