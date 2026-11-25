import {type CurrentUser as SanityCurrentUser} from '@sanity/types'
import {of, switchMap, take} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {observeAppOrganizationId} from '../organization/appOrganization'
import {defineFetcher} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'

// The first version that returns `attributes` only on `includeUserAttributes=true`
const API_VERSION = 'v2026-11-24'

/**
 * Options for reading the current user from `/users/me`.
 * @public
 */
export interface CurrentUserOptions<IncludeUserAttributes extends boolean = false> {
  /** Include the user's attributes in the organization. Each read costs the API several queries. */
  includeUserAttributes?: IncludeUserAttributes
  /**
   * The organization to read attributes from. Defaults to the app's organization. Ignored when
   * the app has a project, whose organization is used instead.
   */
  organizationId?: string
}

/**
 * The signed-in user as returned by `/users/me`. `attributes` can be present only when
 * `includeUserAttributes: true` was passed, and is left out when the user is not a member of the
 * organization or the token doesn't cover it.
 * @public
 */
export type CurrentUser<IncludeUserAttributes extends boolean = false> = [
  IncludeUserAttributes,
] extends [false]
  ? Omit<SanityCurrentUser, 'attributes'>
  : SanityCurrentUser

/**
 * Fetcher for the current user (`GET /users/me`), on the shared fetcher cache.
 *
 * @internal
 */
export const currentUser = defineFetcher<
  [options: CurrentUserOptions<boolean>],
  CurrentUser<boolean>
>({
  name: 'currentUser',
  getKey: (_instance, options) =>
    `${options.includeUserAttributes ?? false}:${options.organizationId ?? ''}`,
  fetch: (instance) => (options) =>
    (options.organizationId ? of(options.organizationId) : observeAppOrganizationId(instance)).pipe(
      take(1),
      switchMap((organizationId) =>
        getClientState(instance, {apiVersion: API_VERSION}).observable.pipe(
          switchMap((client) =>
            client.observable.request<CurrentUser<boolean>>({
              url: '/users/me',
              query: buildQuery({
                includeUserAttributes: options.includeUserAttributes,
                organizationId,
              }),
              tag: 'users.get-current',
            }),
          ),
        ),
      ),
    ),
})
