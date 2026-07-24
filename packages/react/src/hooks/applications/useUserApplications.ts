import {userApplications} from '@sanity/sdk'

import {createFetcherHook} from '../helpers/createFetcherHook'

/**
 * Returns the current user's applications for the given organisation.
 *
 * The hook suspends until the first fetch succeeds, so `data` is always present.
 *
 * @public
 * @param options - Options identifying the organisation.
 * @returns The result envelope `{data, isFetching, error, refetch}`.
 */
export const useUserApplications = createFetcherHook(userApplications)
