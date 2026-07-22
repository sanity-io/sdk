import {userApplication} from '@sanity/sdk'

import {createFetcherHook} from '../helpers/createFetcherHook'

/**
 * Returns a single user application by id.
 *
 * The hook suspends until the first fetch succeeds, so `data` is always present.
 *
 * @public
 * @param userApplicationId - The user application id.
 * @returns The result envelope `{data, isFetching, error, refetch}`.
 */
export const useUserApplication = createFetcherHook(userApplication)
