import {
  type PreferenceListItemValue,
  type PreferenceListKey,
  updateUserPreferenceListItem,
  type UpdateUserPreferenceListItemInput,
  type UserPreferenceOptions,
} from '@sanity/sdk'
import {useCallback} from 'react'

import {createMutationHook, type MutationHookResult} from '../helpers/createMutationHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'
import {useSignedInUserId} from './useSignedInUserId'

const useUpdateUserPreferenceListMutation = createMutationHook(
  (instance, input: UpdateUserPreferenceListItemInput) =>
    updateUserPreferenceListItem(instance, input).then((data) => ({data})),
)

/**
 * Saves one of the signed-in user's items for a key, like a saved query, read with
 * {@link useUserPreferenceList}. It replaces the item with the same ID, and `undefined` removes
 * it. Every page the list has read is read again once the API answers. Without a `projectId`, it
 * uses the project of the nearest resource.
 *
 * @example
 * ```tsx
 * const {mutate: setQuery} = useUpdateUserPreferenceList('studio.vision-tool.saved-queries')
 * setQuery({
 *   itemId: 'q1',
 *   value: {_key: 'q1', url: '?query=*[_type == "post"]', savedAt: new Date().toISOString()},
 * })
 * setQuery({itemId: 'q1', value: undefined})
 * ```
 * @beta
 * @returns The mutation envelope `{mutate, isPending, error, data, reset}`. `mutate` resolves
 * once the API has the change, or rejects with a `PreferenceError` when it refuses it.
 */
export function useUpdateUserPreferenceList<K extends PreferenceListKey>(
  key: K,
  options?: UserPreferenceOptions<K>,
): MutationHookResult<{itemId: string; value: PreferenceListItemValue<K> | undefined}, void> {
  const userId = useSignedInUserId()
  const projectId = useResolvedProjectId({projectId: options?.projectId})
  const {resourceType, organizationId, shared} = options ?? {}
  const {mutate, ...state} = useUpdateUserPreferenceListMutation()
  // Depends on the options' values, not `options`, so an inline object keeps the same function
  const update = useCallback(
    ({itemId, value}: {itemId: string; value: PreferenceListItemValue<K> | undefined}) =>
      // The project comes from the nearest resource for every key, but only a key stored per
      // project reads it, so these are options of any key, not only `K`'s
      mutate({
        userId,
        key,
        itemId,
        value,
        resourceType,
        projectId,
        organizationId,
        shared,
      } as unknown as UpdateUserPreferenceListItemInput),
    [mutate, userId, key, resourceType, projectId, organizationId, shared],
  )
  return {...state, mutate: update}
}
