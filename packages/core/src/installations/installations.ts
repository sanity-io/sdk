import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {defineFetcher} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'
import {type Included} from '../utils/includeShape'

// The Applications API is currently only available on vX.
const API_VERSION = 'vX'

/**
 * Related data the Installations API can embed in a response. Each token adds
 * a top-level field to the {@link Installation} item.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export type InstallationInclude = 'activeConfig' | 'access' | 'interfaces'

/**
 * A resource an installation accesses, embedded when `access` is included.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface InstallationAccess {
  id: string
  resourceType: 'datasets' | 'canvases' | 'dashboards' | 'media-libraries'
  resourceId: string
}

/**
 * An interface exposed by an installation, embedded when `interfaces` is
 * included.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface InstallationInterface {
  id: string
  type: 'app' | 'worker' | 'asset_source' | 'panel'
  name: string
  title: string
  version: string
  /** Module federation module ID; resolved from the host mf-manifest at runtime */
  moduleId: string
  metadata: {group?: string; priority?: number} | null
}

/**
 * The active config of an installation, embedded when `activeConfig` is
 * included. `null` when nothing is deployed.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface InstallationActiveConfig {
  id: string
  installationId: string
  deployedBy: string | null
  version: string
  isActive: boolean
  createdAt: string
}

/**
 * The always-present fields of an active singleton installation returned by the
 * Installations API (`/installations`), before any {@link InstallationInclude}.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface InstallationBase {
  id: string
  applicationId: string
  organizationId: string
  installedBy: string | null
  createdAt: string
  updatedAt: string
  application: {
    title: string
    slug: string | null
  }
}

/**
 * An active singleton installation as returned by the Installations API
 * (`/installations`). `activeConfig`, `access` and `interfaces` are top-level
 * fields, each present only when the matching {@link InstallationInclude} token
 * was requested.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export type Installation<Include extends InstallationInclude = never> = InstallationBase &
  Included<
    InstallationInclude,
    'activeConfig',
    Include,
    {activeConfig: InstallationActiveConfig | null}
  > &
  Included<InstallationInclude, 'access', Include, {access: InstallationAccess[]}> &
  Included<InstallationInclude, 'interfaces', Include, {interfaces: InstallationInterface[]}>

/**
 * Options for listing an organization's installations.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface InstallationsOptions<Include extends InstallationInclude = InstallationInclude> {
  organizationId: string
  include?: Include[]
  /** Page size (1-100, default 50), or `'none'` to disable pagination */
  limit?: number | 'none'
  /** Cursor from a previous response's `nextCursor` */
  cursor?: string
}

/**
 * The cursor-paginated envelope returned by `GET /installations`.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface InstallationsResponse<Include extends InstallationInclude = never> {
  nextCursor: string | null
  data: Installation<Include>[]
}

/** The API takes `include` as a comma-separated list; sorted so key and query agree */
function serializeInclude(include: InstallationInclude[] | undefined): string | undefined {
  return include?.length ? [...include].sort().join(',') : undefined
}

/**
 * Fetcher for an organization's installations (`GET /installations`), on the
 * shared fetcher cache.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const installations = defineFetcher<
  [options: InstallationsOptions],
  InstallationsResponse<InstallationInclude>
>({
  name: 'installations',
  getKey: (_instance, options) =>
    [
      options.organizationId,
      serializeInclude(options.include) ?? '',
      options.limit ?? '',
      options.cursor ?? '',
    ].join(':'),
  fetch: (instance) => (options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<InstallationsResponse<InstallationInclude>>({
          uri: '/installations',
          query: buildQuery({
            organizationId: options.organizationId,
            include: serializeInclude(options.include),
            limit: options.limit,
            cursor: options.cursor,
          }),
          tag: 'installations.list',
        }),
      ),
    ),
  tags: (data) => [
    {type: 'installation', id: 'LIST'},
    ...data.data.map((installation) => ({type: 'installation', id: installation.id})),
  ],
})

/**
 * Fetcher for a single installation (`GET /installations/:id`), on the shared
 * fetcher cache. No pre-seeding from {@link installations}: its list keys
 * include the organization, which this fetcher's params can't reconstruct.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const installation = defineFetcher<
  [installationId: string, options?: {include?: InstallationInclude[]}],
  Installation<InstallationInclude>
>({
  name: 'installation',
  getKey: (_instance, installationId, options) =>
    `${installationId}:${serializeInclude(options?.include) ?? ''}`,
  fetch: (instance) => (installationId, options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<Installation<InstallationInclude>>({
          uri: `/installations/${installationId}`,
          query: buildQuery({include: serializeInclude(options?.include)}),
          tag: 'installations.get',
        }),
      ),
    ),
  tags: (data) => [{type: 'installation', id: data.id}],
})
