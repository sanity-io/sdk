import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'

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

/**
 * Fetcher for a single organization (`GET /organizations/:id`), on the shared
 * fetcher cache. No pre-seeding from the organizations list: it returns a
 * subset of the detail fields, and a partial seed would serve as fresh for
 * the whole stale window.
 *
 * @internal
 */
export const organization = defineFetcher<
  [options?: OrganizationOptions<boolean, boolean>],
  Organization<boolean, boolean>
>({
  name: 'organization',
  getKey: getOrganizationCacheKey,
  fetch: (instance) => (options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<Organization<boolean, boolean>>({
          uri: `/organizations/${resolveOrganizationId(options)}`,
          query: buildQuery(normalizeOrganizationOptions(options)),
          tag: 'organizations.get',
        }),
      ),
    ),
  tags: (data) => [{type: 'organization', id: data.id}],
})
