import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {
  type OrganizationBase,
  type OrganizationMember,
  type OrganizationOptions,
} from '../organization/organization'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'

const API_VERSION = 'v2025-02-19'

/**
 * The list shape returned from `/organizations`, with `members` and/or
 * `features` conditionally included based on the query options used.
 * @public
 */
export type Organizations<
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
> = (Pick<
  OrganizationBase,
  | 'id'
  | 'name'
  | 'slug'
  | 'createdAt'
  | 'updatedAt'
  | 'defaultRoleName'
  | 'dashboardStatus'
  | 'aiFeaturesStatus'
> &
  // `boolean extends T` is non-distributive — true only when T is the wide
  // `boolean`, in which case the field is optional. Literal `true`/`false`
  // fall through to the strict branch.
  (boolean extends IncludeMembers
    ? {members?: OrganizationMember[]}
    : IncludeMembers extends true
      ? {members: OrganizationMember[]}
      : unknown) &
  (boolean extends IncludeFeatures
    ? {features?: string[]}
    : IncludeFeatures extends true
      ? {features: string[]}
      : unknown))[]

/** @public */
export interface OrganizationsOptions<
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
> extends Omit<OrganizationOptions<IncludeMembers, IncludeFeatures>, 'organizationId'> {
  /**
   * When `true`, includes organisations the user has access to via
   * project-level grants, not just direct organisation memberships.
   */
  includeImplicitMemberships?: boolean
}

function normalizeOrganizationsOptions(options?: OrganizationsOptions<boolean, boolean>) {
  return {
    includeImplicitMemberships: options?.includeImplicitMemberships ?? false,
    includeMembers: options?.includeMembers ?? false,
    includeFeatures: options?.includeFeatures ?? false,
  }
}

/** @internal */
export function getOrganizationsCacheKey(
  _instance: SanityInstance,
  options?: OrganizationsOptions<boolean, boolean>,
): string {
  const {includeMembers, includeFeatures, includeImplicitMemberships} =
    normalizeOrganizationsOptions(options)
  const membersKey = includeMembers ? ':members' : ''
  const featuresKey = includeFeatures ? ':features' : ''
  const implicitKey = includeImplicitMemberships ? ':implicit' : ''
  return `organizations${membersKey}${featuresKey}${implicitKey}`
}

/**
 * Fetcher for the current user's organizations (`GET /organizations`), on the
 * shared fetcher cache.
 *
 * @internal
 */
export const organizations = defineFetcher<
  [options?: OrganizationsOptions<boolean, boolean>],
  Organizations<boolean, boolean>
>({
  name: 'organizations',
  getKey: getOrganizationsCacheKey,
  fetch: (instance) => (options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<Organizations<boolean, boolean>>({
          uri: '/organizations',
          query: buildQuery(normalizeOrganizationsOptions(options)),
          tag: 'organizations.list',
        }),
      ),
    ),
  tags: (data) => [
    {type: 'organization', id: 'LIST'},
    ...data.map((org) => ({type: 'organization', id: org.id})),
  ],
})
