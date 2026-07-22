import {
  type InstallationInclude,
  installations,
  type InstallationsOptions,
  type InstallationsResponse,
} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * Returns the installations matching the given options.
 *
 * The hook suspends until the first fetch succeeds, so `data` is always present.
 * The `include` tokens you pass shape `data.data`: each requested token adds its
 * field, and omitted ones are absent from the type.
 *
 * @public
 * @param options - Filter and include options for the installations list.
 * @returns The result envelope `{data, isFetching, error, refetch}`.
 */
export const useInstallations = createFetcherHook(installations) as <
  Include extends InstallationInclude = never,
>(
  options: InstallationsOptions<Include>,
) => FetcherHookResult<InstallationsResponse<Include>>
