import {
  getOrganizationsState,
  type Organizations,
  type OrganizationsOptions,
  resolveOrganizations,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * Returns metadata for each organisation the current user has access to.
 *
 * @category Organizations
 * @param options - Configuration options
 * @returns An array of organisation metadata. `members` is included only when
 *   `includeMembers: true`; `features` is included only when `includeFeatures: true`.
 * @example
 * ```tsx
 * const organizations = useOrganizations()
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
 * const organizationsWithMembers = useOrganizations({includeMembers: true})
 * const organizationsWithFeatures = useOrganizations({includeFeatures: true})
 * const organizationsIncludingImplicit = useOrganizations({includeImplicitMemberships: true})
 * ```
 * @public
 * @function
 */
export const useOrganizations = createStateSourceHook({
  getState: getOrganizationsState,
  shouldSuspend: (instance, ...params) =>
    getOrganizationsState(instance, ...params).getCurrent() === undefined,
  suspender: resolveOrganizations,
}) as <IncludeMembers extends boolean = false, IncludeFeatures extends boolean = false>(
  options?: OrganizationsOptions<IncludeMembers, IncludeFeatures>,
) => Organizations<IncludeMembers, IncludeFeatures>
