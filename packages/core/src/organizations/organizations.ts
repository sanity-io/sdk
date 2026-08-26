import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {
  type OrganizationBase,
  type OrganizationMember,
  type OrganizationOptions,
} from '../organization/organization'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {createFetcherStore} from '../utils/createFetcherStore'

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

function normalizeOrganizationOptions(options?: OrganizationsOptions<boolean, boolean>) {
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
    normalizeOrganizationOptions(options)
  const membersKey = includeMembers ? ':members' : ''
  const featuresKey = includeFeatures ? ':features' : ''
  const implicitKey = includeImplicitMemberships ? ':implicit' : ''
  return `organizations${membersKey}${featuresKey}${implicitKey}`
}

const organizations = createFetcherStore({
  name: 'Organizations',
  getKey: getOrganizationsCacheKey,
  fetcher: (instance) => (options?: OrganizationsOptions<boolean, boolean>) => {
    return getClientState(instance, {
      apiVersion: API_VERSION,
      scope: 'global',
    }).observable.pipe(
      switchMap((client) => {
        const normalized = normalizeOrganizationOptions(options)
        const query = Object.fromEntries(
          Object.entries(normalized)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        )

        return client.observable.request({
          uri: `/organizations`,
          query,
          tag: 'organizations.get',
        })
      }),
    )
  },
})

/**
 * Public signature for the organization state source. The conditional generics
 * cannot flow through `BoundStoreAction`, so we declare the signature here
 * and assign the (already-correct) runtime function to it.
 */
type GetOrganizationsState = <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
>(
  instance: SanityInstance,
  options?: OrganizationsOptions<IncludeMembers, IncludeFeatures>,
) => StateSource<Organizations<IncludeMembers, IncludeFeatures> | undefined>

type ResolveOrganizations = <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
>(
  instance: SanityInstance,
  options?: OrganizationsOptions<IncludeMembers, IncludeFeatures>,
) => Promise<Organizations<IncludeMembers, IncludeFeatures>>

/** @public */
export const getOrganizationsState: GetOrganizationsState = organizations.getState

/** @public */
export const resolveOrganizations: ResolveOrganizations = organizations.resolveState
