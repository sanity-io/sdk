import {
  getOrganizationState,
  type Organization,
  type OrganizationOptions,
  resolveOrganization,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * Returns metadata for a given organisation.
 *
 * @category Organizations
 * @param options - Configuration options
 * @returns The metadata for the organisation. `members` is included only when
 *   `includeMembers: true`; `features` is included only when `includeFeatures: true`.
 * @example
 * ```tsx
 * function OrganizationName({organizationId}: {organizationId: string}) {
 *   const organization = useOrganization({organizationId})
 *
 *   return <h1>{organization.name}</h1>
 * }
 * ```
 * @example
 * ```tsx
 * const organizationWithMembers = useOrganization({organizationId, includeMembers: true})
 * const organizationWithFeatures = useOrganization({organizationId, includeFeatures: true})
 * ```
 * @public
 * @function
 */
export const useOrganization = createStateSourceHook({
  getState: getOrganizationState,
  shouldSuspend: (instance, ...params) =>
    getOrganizationState(instance, ...params).getCurrent() === undefined,
  suspender: resolveOrganization,
}) as <IncludeMembers extends boolean = false, IncludeFeatures extends boolean = false>(
  options: OrganizationOptions<IncludeMembers, IncludeFeatures>,
) => Organization<IncludeMembers, IncludeFeatures>
