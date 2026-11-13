import {
  type InstallationInclude,
  installations,
  type InstallationsOptions,
  type InstallationsResponse,
} from '@sanity/sdk'

import {
  createPagedFetcherHook,
  type PagedFetcherHookResult,
} from '../helpers/createPagedFetcherHook'

/**
 * Returns the installations matching the given options, a page at a time.
 *
 * The hook suspends until the first page is read, so `data` is always present.
 * `loadMore` reads the next page and adds its installations to `data.data`,
 * keeping the ones already shown, also when it fails. The `include` tokens you
 * pass shape `data.data`: each requested token adds its field, and omitted ones
 * are absent from the type.
 *
 * @public
 * @param options - Filter and include options for the installations list.
 * @returns The result envelope `{data, isFetching, error, refetch, hasMore, isPending, loadMore}`.
 * @category Applications
 */
export const useInstallations = createPagedFetcherHook(installations) as <
  Include extends InstallationInclude = never,
>(
  options: InstallationsOptions<Include>,
) => PagedFetcherHookResult<InstallationsResponse<Include>>
