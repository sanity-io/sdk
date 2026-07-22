import {
  type Organizations,
  organizations,
  type OrganizationsOptions,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {mapStateSource} from '../helpers/mapStateSource'

const getOrganizationsData = (
  instance: SanityInstance,
  options?: OrganizationsOptions<boolean, boolean>,
): StateSource<Organizations<boolean, boolean> | undefined> =>
  mapStateSource(organizations.getState(instance, options), (snapshot) => snapshot.data)

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
  getState: getOrganizationsData,
  shouldSuspend: (instance, ...params) =>
    getOrganizationsData(instance, ...params).getCurrent() === undefined,
  suspender: organizations.resolveState,
}) as <IncludeMembers extends boolean = false, IncludeFeatures extends boolean = false>(
  options?: OrganizationsOptions<IncludeMembers, IncludeFeatures>,
) => Organizations<IncludeMembers, IncludeFeatures>
