import {type Application, application, type ApplicationInclude} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * Returns a single application by id or slug.
 *
 * The hook suspends until the first fetch succeeds, so `data` is always present.
 * The `include` tokens you pass shape `data`: each requested token adds its
 * field, and omitted ones are absent from the type.
 *
 * @public
 * @param applicationIdOrSlug - The application id, or its slug when
 * `organizationId` is set.
 * @param options - Optional `include` list to expand related resources, and the
 * `organizationId` the application belongs to. A slug needs it, since a slug is
 * only unique within an organization.
 * @returns The result envelope `{data, isFetching, error, refetch}`.
 * @category Applications
 */
export const useApplication = createFetcherHook(application) as <
  Include extends ApplicationInclude = never,
>(
  applicationIdOrSlug: string,
  options?: {include?: Include[]; organizationId?: string},
) => FetcherHookResult<Application<Include>>
