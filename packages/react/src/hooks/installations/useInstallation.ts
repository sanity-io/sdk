import {type Installation, installation, type InstallationInclude} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * Returns a single installation by id.
 *
 * The hook suspends until the first fetch succeeds, so `data` is always present.
 * The `include` tokens you pass shape `data`: each requested token adds its
 * field, and omitted ones are absent from the type.
 *
 * @public
 * @param installationId - The installation id.
 * @param options - Optional `include` list to expand related resources.
 * @returns The result envelope `{data, isFetching, error, refetch}`.
 */
export const useInstallation = createFetcherHook(installation) as <
  Include extends InstallationInclude = never,
>(
  installationId: string,
  options?: {include?: Include[]},
) => FetcherHookResult<Installation<Include>>
