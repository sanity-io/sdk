import {type Application, application, type ApplicationInclude} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * Returns a single application by id.
 *
 * The hook suspends until the first fetch succeeds, so `data` is always present.
 * The `include` tokens you pass shape `data`: each requested token adds its
 * field, and omitted ones are absent from the type.
 *
 * @public
 * @param applicationId - The application id.
 * @param options - Optional `include` list to expand related resources.
 * @returns The result envelope `{data, isFetching, error, refetch}`.
 */
export const useApplication = createFetcherHook(application) as <
  Include extends ApplicationInclude = never,
>(
  applicationId: string,
  options?: {include?: Include[]},
) => FetcherHookResult<Application<Include>>
