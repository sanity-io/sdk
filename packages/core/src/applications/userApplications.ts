import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {defineFetcher, defineMutation} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'
import {type ApplicationVisibility, type DeletedResult} from './applications'

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

/**
 * Fields you can set when creating or updating a user application.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export interface UserApplicationWriteFields {
  /** Human-friendly display name; `null` clears it */
  title?: string | null
  /** `internal` for Sanity-hosted studios, `external` for externally hosted */
  urlType?: 'internal' | 'external'
  /** Studio subdomain (internal) or full `https` URL (external) */
  appHost?: string
  /** Internal apps only: make this the default app for the deployment */
  isDefaultForDeployment?: boolean
  /** Dashboard visibility */
  dashboardStatus?: ApplicationVisibility
  /** Auto-update channel or a pinned semver */
  autoUpdatingVersion?: string | null
}

/**
 * Input for {@link createUserApplication}: the writable fields, with `urlType`
 * and `appHost` required. `organizationId` and `appType` are sent as query
 * parameters; the rest form the request body.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export interface CreateUserApplicationInput extends UserApplicationWriteFields {
  /** Query param: owning organization */
  organizationId?: string
  /** Query param: `studio` or `coreApp` */
  appType?: 'studio' | 'coreApp'
  urlType: 'internal' | 'external'
  appHost: string
  /** Create does not accept a `null` title */
  title?: string
}

/**
 * Mutation to create a user application (`POST /user-applications`). Invalidates
 * the list so it reconverges to include the new entry.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const createUserApplication = defineMutation<CreateUserApplicationInput, UserApplication>({
  name: 'createUserApplication',
  mutationFn:
    (instance) =>
    ({organizationId, appType, ...body}) =>
      getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
        switchMap((client) =>
          client.observable.request<UserApplication>({
            uri: '/user-applications',
            method: 'POST',
            query: buildQuery({organizationId, appType}),
            body,
            tag: 'user-applications.create',
          }),
        ),
      ),
  invalidates: [{type: 'user-application', id: 'LIST'}],
})

/**
 * Input for {@link updateUserApplication}: the writable fields (all optional),
 * keyed by id.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export interface UpdateUserApplicationInput extends UserApplicationWriteFields {
  userApplicationId: string
}

/**
 * Mutation to update a user application (`PATCH /user-applications/:id`).
 * Invalidates the updated entry and the list.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const updateUserApplication = defineMutation<UpdateUserApplicationInput, UserApplication>({
  name: 'updateUserApplication',
  mutationFn:
    (instance) =>
    ({userApplicationId, ...body}) =>
      getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
        switchMap((client) =>
          client.observable.request<UserApplication>({
            uri: `/user-applications/${userApplicationId}`,
            method: 'PATCH',
            body,
            tag: 'user-applications.update',
          }),
        ),
      ),
  invalidates: (_result, {userApplicationId}) => [
    {type: 'user-application', id: 'LIST'},
    {type: 'user-application', id: userApplicationId},
  ],
})

/**
 * Input for {@link deleteUserApplication}.
 *
 * @internal
 */
export interface DeleteUserApplicationInput {
  userApplicationId: string
}

/**
 * Mutation to delete a user application (`DELETE /user-applications/:id`).
 * Invalidates the deleted entry and the list.
 *
 * @see https://www.sanity.io/docs/http-reference/applications-api
 * @internal
 */
export const deleteUserApplication = defineMutation<DeleteUserApplicationInput, DeletedResult>({
  name: 'deleteUserApplication',
  mutationFn:
    (instance) =>
    ({userApplicationId}) =>
      getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
        switchMap((client) =>
          client.observable.request<DeletedResult>({
            uri: `/user-applications/${userApplicationId}`,
            method: 'DELETE',
            tag: 'user-applications.delete',
          }),
        ),
      ),
  invalidates: (_result, {userApplicationId}) => [
    {type: 'user-application', id: 'LIST'},
    {type: 'user-application', id: userApplicationId},
  ],
})
