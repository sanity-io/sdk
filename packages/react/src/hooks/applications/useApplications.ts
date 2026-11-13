import {
  type ApplicationInclude,
  applications,
  type ApplicationsOptions,
  type ApplicationsResponse,
} from '@sanity/sdk'

import {
  createPagedFetcherHook,
  type PagedFetcherHookResult,
} from '../helpers/createPagedFetcherHook'

/**
 * Returns the applications matching the given options, a page at a time.
 *
 * The hook suspends until the first page is read, so `data` is always present.
 * `loadMore` reads the next page and adds its applications to `data.data`,
 * keeping the ones already shown, also when it fails. The `include` tokens you
 * pass shape `data.data`: each requested token adds its field, and omitted ones
 * are absent from the type.
 *
 * @public
 * @param options - Filter and include options for the applications list.
 * @returns The result envelope `{data, isFetching, error, refetch, hasMore, isPending, loadMore}`.
 * @category Applications
 */
export const useApplications = createPagedFetcherHook(applications) as <
  Include extends ApplicationInclude = never,
>(
  options: ApplicationsOptions<Include>,
) => PagedFetcherHookResult<ApplicationsResponse<Include>>
