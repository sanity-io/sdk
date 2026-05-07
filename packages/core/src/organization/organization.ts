import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

/** @public */
export interface OrganizationMember {
  sanityUserId: string
  isCurrentUser: boolean
  user: {
    id: string
    displayName: string
    familyName: string
    givenName: string
    middleName: string | null
    imageUrl: string | null
    email: string
    loginProvider: string
  }
  roles: Array<{
    name: string
    title: string
    description?: string
  }>
}

/**
 * The base fields returned from `/organizations/<id>` for every organization.
 * @public
 */
export interface OrganizationBase {
  id: string
  name: string
  slug: string | null
  createdAt: string
  createdByUserId: string
  updatedAt: string
  deletedAt: string | null
  dashboardStatus: 'enabled' | 'disabled'
  aiFeaturesStatus: 'enabled' | 'disabled'
  mediaLibraryStatus: 'enabled' | 'disabled'
  requestAccessStatus: 'allowed' | 'disabled'
  telemetryConsentStatus: 'allowed' | 'msa_denied' | 'customer_denied'
  oauthAppsStatus: 'allowed' | 'blocked'
  defaultRoleName: string
  domains: string[] | null
}

/** @public */
export interface OrganizationOptions<
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
> {
  includeMembers?: IncludeMembers
  includeFeatures?: IncludeFeatures
  organizationId: string
}

/**
 * An `Organization` with `members` and/or `features` conditionally included
 * based on the query options used to fetch it.
 * @public
 */
export type Organization<
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
> = OrganizationBase &
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
      : unknown)

function resolveOrganizationId(options?: OrganizationOptions<boolean, boolean>) {
  const organizationId = options?.organizationId
  if (!organizationId) {
    throw new Error('An organizationId is required to use the organization API.')
  }
  return organizationId
}

function normalizeOrganizationOptions(options?: OrganizationOptions<boolean, boolean>) {
  return {
    includeMembers: options?.includeMembers ?? false,
    includeFeatures: options?.includeFeatures ?? false,
  }
}

/** @internal */
export function getOrganizationCacheKey(
  _instance: SanityInstance,
  options?: OrganizationOptions<boolean, boolean>,
): string {
  const organizationId = resolveOrganizationId(options)
  const {includeMembers, includeFeatures} = normalizeOrganizationOptions(options)
  const membersKey = includeMembers ? ':members' : ''
  const featuresKey = includeFeatures ? ':features' : ''
  return `organization:${organizationId}${membersKey}${featuresKey}`
}

const organization = createFetcherStore({
  name: 'Organization',
  getKey: getOrganizationCacheKey,
  fetcher: (instance) => (options?: OrganizationOptions<boolean, boolean>) => {
    const organizationId = resolveOrganizationId(options)

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
          uri: `/organizations/${organizationId}`,
          query,
          tag: 'organization.get',
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
type GetOrganizationState = <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
>(
  instance: SanityInstance,
  options: OrganizationOptions<IncludeMembers, IncludeFeatures>,
) => StateSource<Organization<IncludeMembers, IncludeFeatures> | undefined>

type ResolveOrganization = <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = false,
>(
  instance: SanityInstance,
  options: OrganizationOptions<IncludeMembers, IncludeFeatures>,
) => Promise<Organization<IncludeMembers, IncludeFeatures>>

/** @public */
export const getOrganizationState: GetOrganizationState = organization.getState

/** @public */
export const resolveOrganization: ResolveOrganization = organization.resolveState
