import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {defineFetcher} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'

// The version the CLI pins for this API family; verify against the deployed
// API before promoting these stores past @internal.
const API_VERSION = 'v2024-08-01'

/**
 * A deployment of a user application, embedded when `activeDeployment` is
 * included on the User Applications API. Distinct from the org Applications
 * API's {@link ApplicationDeployment} summary.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface UserApplicationDeployment {
  id: string
  version: string | null
  isActiveDeployment: boolean
  userApplicationId: string
  isAutoUpdating: boolean | null
  size: number | null
  deployedAt: string
  deployedBy: string | null
  createdAt: string
  updatedAt: string
  manifest: unknown
}

/**
 * A user application (deployed studio or custom app) as returned by
 * `/user-applications`.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface UserApplication {
  id: string
  projectId: string | null
  organizationId: string | null
  title: string | null
  type: string
  urlType: string
  appHost: string
  dashboardStatus: string
  createdAt: string
  updatedAt: string
  autoUpdatingVersion: string | null
  activeDeployment: UserApplicationDeployment | null
  manifestData: unknown
  config: Record<string, unknown> | null
  manifest: unknown
}

/**
 * Options for listing an organization's user applications.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @public
 */
export interface UserApplicationsOptions {
  organizationId: string
}

/**
 * Fetcher for an organization's user applications (`GET /user-applications`),
 * on the shared fetcher cache.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const userApplications = defineFetcher<
  [options: UserApplicationsOptions],
  UserApplication[]
>({
  name: 'userApplications',
  getKey: (_instance, options) => options.organizationId,
  fetch: (instance) => (options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<UserApplication[]>({
          uri: '/user-applications',
          query: buildQuery({organizationId: options.organizationId}),
          tag: 'user-applications.list',
        }),
      ),
    ),
  tags: (data) => [
    {type: 'user-application', id: 'LIST'},
    ...data.map((app) => ({type: 'user-application', id: app.id})),
  ],
})

/**
 * Fetcher for a single user application (`GET /user-applications/:id`), on the
 * shared fetcher cache. No pre-seeding from {@link userApplications}: its list
 * keys include the organization, which this fetcher's params can't
 * reconstruct.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const userApplication = defineFetcher<[userApplicationId: string], UserApplication>({
  name: 'userApplication',
  getKey: (_instance, userApplicationId) => userApplicationId,
  fetch: (instance) => (userApplicationId) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<UserApplication>({
          uri: `/user-applications/${userApplicationId}`,
          tag: 'user-applications.get',
        }),
      ),
    ),
  tags: (data) => [{type: 'user-application', id: data.id}],
})
