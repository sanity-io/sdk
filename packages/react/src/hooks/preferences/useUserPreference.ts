import {
  type PreferenceKey,
  type UserPreference,
  userPreference,
  type UserPreferenceOptions,
  whenOrganizationKnown,
} from '@sanity/sdk'

import {useSanityInstance} from '../context/useSanityInstance'
import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'
import {useSignedInUserId} from './useSignedInUserId'

// Typed by key, as `useApplication` is by `include`: the cache holds every key's value in one type
const useUserPreferenceFetcher = createFetcherHook(userPreference) as <K extends PreferenceKey>(
  userId: string,
  key: K,
  options?: UserPreferenceOptions,
) => FetcherHookResult<UserPreference<K>>

/**
 * Reads a preference of the signed-in user. Suspends until the user and a value are known: the
 * value cached from the user's last visit, or else the API's. Change it with
 * {@link useUpdateUserPreference}.
 *
 * The options say where to read, and only take the places the key is stored in. Without a
 * `projectId`, it uses the project of the nearest resource; without an `organizationId`, the
 * Dashboard's organization, which it waits for. `shared: true` reads the value everyone in the
 * project or organization shares, where the key has one. `resourceType` names the kind of
 * resource, which a key stored in both projects and organizations needs.
 *
 * `data` says where the value comes from:
 *
 * - `isDefault`: nobody has set a value, so it's the key's default.
 * - `shared`: it's the value everyone in the resource shares, not the user's own.
 * - `resourceType`: the kind of resource it's stored in. Missing for the default, and for a value
 *   that applies everywhere, like the user's starred projects.
 * - `canEdit`: whether the user can change it where a change goes.
 *
 * @example
 * ```tsx
 * const {data} = useUserPreference('studio.structure-tool.layout.book')
 * return <p>Layout: {data.value}{data.isDefault && ' (default)'}</p>
 * ```
 * @beta
 * @returns The fetcher envelope `{data, isFetching, error, refetch}`.
 */
export function useUserPreference<K extends PreferenceKey>(
  key: K,
  options?: UserPreferenceOptions<K>,
): FetcherHookResult<UserPreference<K>> {
  const instance = useSanityInstance()
  const userId = useSignedInUserId()
  const projectId = useResolvedProjectId({projectId: options?.projectId})
  // The cache key names the organization, so it has to be known before the read starts
  const organization = whenOrganizationKnown(instance, key, options)
  if (organization) throw organization
  return useUserPreferenceFetcher(userId, key, {...options, projectId})
}
