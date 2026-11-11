import {
  type PreferenceKey,
  type UserPreference,
  userPreference,
  type UserPreferenceOptions,
} from '@sanity/sdk'

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
 * value cached from the user's last visit, or else the API's. Without a `projectId`, it uses the
 * project of the nearest resource. Change it with {@link useUpdateUserPreference}.
 *
 * @example
 * ```tsx
 * const {data} = useUserPreference('studio.structure-tool.layout.book')
 * return <p>Layout: {data.value}</p>
 * ```
 * @beta
 * @returns The fetcher envelope `{data, isFetching, error, refetch}`.
 */
export function useUserPreference<K extends PreferenceKey>(
  key: K,
  options?: UserPreferenceOptions<K>,
): FetcherHookResult<UserPreference<K>> {
  const userId = useSignedInUserId()
  const projectId = useResolvedProjectId({projectId: options?.projectId})
  return useUserPreferenceFetcher(userId, key, {projectId, organizationId: options?.organizationId})
}
