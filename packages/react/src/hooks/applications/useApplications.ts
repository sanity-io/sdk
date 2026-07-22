import {
  type ApplicationInclude,
  applications,
  type ApplicationsOptions,
  type ApplicationsResponse,
} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * Returns the applications matching the given options.
 *
 * The hook suspends until the first fetch succeeds, so `data` is always present.
 * The `include` tokens you pass shape `data.data`: each requested token adds its
 * field, and omitted ones are absent from the type.
 *
 * @public
 * @param options - Filter and include options for the applications list.
 * @returns The result envelope `{data, isFetching, error, refetch}`.
 */
export const useApplications = createFetcherHook(applications) as <
  Include extends ApplicationInclude = never,
>(
  options: ApplicationsOptions<Include>,
) => FetcherHookResult<ApplicationsResponse<Include>>
