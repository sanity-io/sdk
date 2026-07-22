import {type Organizations, organizations, type OrganizationsOptions} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * Returns metadata for each organisation the current user has access to.
 *
 * @category Organizations
 * @param options - Configuration options
 * @returns A {@link FetcherHookResult} whose `data` is an array of organisation
 *   metadata. `members` is included only when `includeMembers: true`; `features`
 *   is included only when `includeFeatures: true`.
 * @example
 * ```tsx
 * const {data: organizations} = useOrganizations()
 *
 * return (
 *   <select>
 *     {organizations.map((organization) => (
 *       <option key={organization.id}>{organization.name}</option>
 *     ))}
 *   </select>
 * )
 * ```
 * @example
 * ```tsx
 * const {data: organizationsWithMembers} = useOrganizations({includeMembers: true})
 * const {data: organizationsWithFeatures} = useOrganizations({includeFeatures: true})
 * const {data: organizationsIncludingImplicit} = useOrganizations({includeImplicitMemberships: true})
 * ```
 * @public
 * @function
 */
export const useOrganizations = createFetcherHook(organizations) as <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
>(
  options?: OrganizationsOptions<IncludeMembers, IncludeFeatures>,
) => FetcherHookResult<Organizations<IncludeMembers, IncludeFeatures>>
