import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {defineFetcher, defineMutation} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'
import {type Included, type IncludesAny} from '../utils/includeShape'

// The Applications API is currently only available on vX.
const API_VERSION = 'vX'

/**
 * Related data the Applications API can embed in a response. `interfaces`,
 * `workspaces` and `access` are children of the active deployment and are
 * embedded under {@link Application.activeDeployment}; `config.studio` and
 * `config.mfManifest` are embedded under {@link Application.config}.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export type ApplicationInclude =
  | 'interfaces'
  | 'workspaces'
  | 'access'
  | 'config.studio'
  | 'config.mfManifest'
  | 'activeDeployment'

/**
 * An interface exposed by a deployment, embedded when `interfaces` is included.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface ApplicationInterface {
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
 * A studio workspace of a deployment, embedded when `workspaces` is included.
 * Studio applications only.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface ApplicationWorkspace {
  id: string
  name: string
  title: string | null
  subtitle: string | null
  projectId: string
  dataset: string
  schemaDescriptorId: string | null
  basePath: string | null
  /** Sanitized SVG icon markup */
  icon: string | null
}

/**
 * A resource an application accesses, embedded when `access` is included.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface ApplicationAccess {
  id: string
  resourceType: 'datasets' | 'canvases' | 'dashboards' | 'media-libraries'
  resourceId: string
}

/**
 * Studio configuration, embedded under `config` when `config.studio` is included.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface ApplicationStudioConfig {
  projectId: string
  /** Release channel (`next`, `stable`, `latest`) or a pinned semver; null if unset */
  autoUpdatingVersion: string | null
}

/**
 * The active deployment as embedded under {@link Application.activeDeployment}.
 * Its `interfaces`, `workspaces` and `access` children are each present only
 * when the matching {@link ApplicationInclude} token was requested. `workspaces`
 * is omitted (not `null`) for non-studio applications even when requested.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export type ApplicationDeployment<Include extends ApplicationInclude = never> = {
  id: string
  applicationId: string
  size: number | null
  version: string | null
  isAutoUpdating: boolean | null
  isActiveDeployment: boolean
  deployedBy: string | null
  createdAt: string
  updatedAt: string
} & Included<ApplicationInclude, 'interfaces', Include, {interfaces: ApplicationInterface[]}> &
  Included<ApplicationInclude, 'workspaces', Include, {workspaces?: ApplicationWorkspace[]}> &
  Included<ApplicationInclude, 'access', Include, {access: ApplicationAccess[]}>

/**
 * The always-present fields of an org-owned application returned by the
 * Applications API (`/applications`), before any {@link ApplicationInclude}.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface ApplicationBase {
  id: string
  type: 'studio' | 'coreApp'
  title: string
  icon: string | null
  isSingleton: boolean
  visibility: 'default' | 'unlisted' | 'disabled'
  slug: string | null
  externalUrl: string | null
  organizationId: string
  createdAt: string
  updatedAt: string
}

// Requesting any of these tokens forces the deployment summary into the response.
type DeploymentToken = 'activeDeployment' | 'interfaces' | 'workspaces' | 'access'

// `config` is present when either config child was requested; each child is
// gated on its own token.
type ApplicationConfigShape<Include extends ApplicationInclude> = Included<
  ApplicationInclude,
  'config.studio',
  Include,
  {config: {studio: ApplicationStudioConfig}}
> &
  Included<ApplicationInclude, 'config.mfManifest', Include, {config: {mfManifest: unknown}}>

// `activeDeployment` is present when any deployment-related token was requested;
// a wide include array makes it optional.
type ApplicationDeploymentShape<Include extends ApplicationInclude> = [ApplicationInclude] extends [
  Include,
]
  ? {activeDeployment?: ApplicationDeployment<Include> | null}
  : IncludesAny<Include, DeploymentToken> extends true
    ? {activeDeployment: ApplicationDeployment<Include> | null}
    : unknown

/**
 * An org-owned application as returned by the Applications API
 * (`/applications`). `config` and `activeDeployment` (with its
 * `interfaces`/`workspaces`/`access` children) are present only when the
 * corresponding {@link ApplicationInclude} tokens were requested.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export type Application<Include extends ApplicationInclude = never> = ApplicationBase &
  ApplicationConfigShape<Include> &
  ApplicationDeploymentShape<Include>

/**
 * Options for listing an organization's applications.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface ApplicationsOptions<Include extends ApplicationInclude = ApplicationInclude> {
  organizationId: string
  /** Filter by application type */
  type?: string
  include?: Include[]
  /** Page size (1-100, default 50), or `'none'` to disable pagination */
  limit?: number | 'none'
  /** Cursor from a previous response's `nextCursor` */
  cursor?: string
}

/**
 * The cursor-paginated envelope returned by `GET /applications`.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface ApplicationsResponse<Include extends ApplicationInclude = never> {
  nextCursor: string | null
  data: Application<Include>[]
}

/** The API takes `include` as a comma-separated list; sorted so key and query agree */
function serializeInclude(include: ApplicationInclude[] | undefined): string | undefined {
  return include?.length ? [...include].sort().join(',') : undefined
}

/**
 * Fetcher for an organization's applications (`GET /applications`), on the
 * shared fetcher cache.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const applications = defineFetcher<
  [options: ApplicationsOptions],
  ApplicationsResponse<ApplicationInclude>
>({
  name: 'applications',
  getKey: (_instance, options) =>
    [
      options.organizationId,
      options.type ?? '',
      serializeInclude(options.include) ?? '',
      options.limit ?? '',
      options.cursor ?? '',
    ].join(':'),
  fetch: (instance) => (options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<ApplicationsResponse<ApplicationInclude>>({
          uri: '/applications',
          query: buildQuery({
            organizationId: options.organizationId,
            type: options.type,
            include: serializeInclude(options.include),
            limit: options.limit,
            cursor: options.cursor,
          }),
          tag: 'applications.list',
        }),
      ),
    ),
  tags: (data) => [
    {type: 'application', id: 'LIST'},
    ...data.data.map((app) => ({type: 'application', id: app.id})),
  ],
})

/**
 * Fetcher for a single application (`GET /applications/:id`), on the shared
 * fetcher cache. No pre-seeding from {@link applications}: its list keys
 * include the organization, which this fetcher's params can't reconstruct.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const application = defineFetcher<
  [applicationId: string, options?: {include?: ApplicationInclude[]}],
  Application<ApplicationInclude>
>({
  name: 'application',
  getKey: (_instance, applicationId, options) =>
    `${applicationId}:${serializeInclude(options?.include) ?? ''}`,
  fetch: (instance) => (applicationId, options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<Application<ApplicationInclude>>({
          uri: `/applications/${applicationId}`,
          query: buildQuery({include: serializeInclude(options?.include)}),
          tag: 'applications.get',
        }),
      ),
    ),
  tags: (data) => [{type: 'application', id: data.id}],
})

/**
 * Confirmation returned by the API's soft-delete endpoints.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export interface DeletedResult {
  deleted: boolean
}

/**
 * Dashboard visibility for an application. The same set of values backs a user
 * application's `dashboardStatus`.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export type ApplicationVisibility = ApplicationBase['visibility']

/**
 * Mutable properties of an application (`PATCH /applications/:id`) — the
 * writable subset of {@link ApplicationBase}, each optional, keyed by id.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export type UpdateApplicationInput = {applicationId: string} & Partial<
  Pick<ApplicationBase, 'title' | 'icon' | 'visibility'>
>

/**
 * Mutation to update an application (`PATCH /applications/:id`). Invalidates the
 * updated application and the list so active entries reconverge on server truth.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const updateApplication = defineMutation<UpdateApplicationInput, Application>({
  name: 'updateApplication',
  mutationFn:
    (instance) =>
    ({applicationId, ...body}) =>
      getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
        switchMap((client) =>
          client.observable.request<Application>({
            uri: `/applications/${applicationId}`,
            method: 'PATCH',
            body,
            tag: 'applications.update',
          }),
        ),
      ),
  invalidates: (_result, {applicationId}) => [
    {type: 'application', id: 'LIST'},
    {type: 'application', id: applicationId},
  ],
})

/**
 * Input for {@link deleteApplication}.
 *
 * @internal
 */
export interface DeleteApplicationInput {
  applicationId: string
}

/**
 * Mutation to soft-delete an application (`DELETE /applications/:id`).
 * Invalidates the deleted application and the list.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const deleteApplication = defineMutation<DeleteApplicationInput, DeletedResult>({
  name: 'deleteApplication',
  mutationFn:
    (instance) =>
    ({applicationId}) =>
      getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
        switchMap((client) =>
          client.observable.request<DeletedResult>({
            uri: `/applications/${applicationId}`,
            method: 'DELETE',
            tag: 'applications.delete',
          }),
        ),
      ),
  invalidates: (_result, {applicationId}) => [
    {type: 'application', id: 'LIST'},
    {type: 'application', id: applicationId},
  ],
})
