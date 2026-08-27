import {type Organization, organization, type OrganizationOptions} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * Returns metadata for a given organisation.
 *
 * @category Organizations
 * @param options - Configuration options
 * @returns A {@link FetcherHookResult} whose `data` is the metadata for the
 *   organisation. `members` is included only when `includeMembers: true`;
 *   `features` is included only when `includeFeatures: true`.
 * @example
 * ```tsx
 * function OrganizationName({organizationId}: {organizationId: string}) {
 *   const {data: organization} = useOrganization({organizationId})
 *
 *   return <h1>{organization.name}</h1>
 * }
 * ```
 * @example
 * ```tsx
 * const {data: organizationWithMembers} = useOrganization({organizationId, includeMembers: true})
 * const {data: organizationWithFeatures} = useOrganization({organizationId, includeFeatures: true})
 * ```
 * @public
 * @function
 */
export const useOrganization = createFetcherHook(organization) as <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
>(
  options: OrganizationOptions<IncludeMembers, IncludeFeatures>,
) => FetcherHookResult<Organization<IncludeMembers, IncludeFeatures>>
