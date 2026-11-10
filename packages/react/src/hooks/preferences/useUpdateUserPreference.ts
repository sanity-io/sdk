import {
  type PreferenceEdit,
  type PreferenceKey,
  updateUserPreference,
  type UpdateUserPreferenceInput,
  type UserPreference,
  type UserPreferenceOptions,
} from '@sanity/sdk'
import {useCallback} from 'react'

import {createMutationHook, type MutationHookResult} from '../helpers/createMutationHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'
import {useSignedInUserId} from './useSignedInUserId'

const useUpdateUserPreferenceMutation = createMutationHook(
  (instance, input: UpdateUserPreferenceInput) =>
    updateUserPreference(instance, input).then((data) => ({data})),
)

/**
 * Changes a preference of the signed-in user, read with {@link useUserPreference}. A value shows
 * at once and goes back if the API refuses it. `undefined` removes the user's value, so the key's
 * default applies again. A function gets the value on screen and returns the next one, like a
 * toggle. Without a `projectId`, it uses the project of the nearest resource.
 *
 * @example
 * ```tsx
 * const {mutate: setLayout, error} = useUpdateUserPreference('studio.structure-tool.layout.book')
 * setLayout('compact')
 * setLayout((layout) => (layout === 'compact' ? 'detail' : 'compact'))
 * setLayout(undefined)
 * ```
 * @beta
 * @returns The mutation envelope `{mutate, isPending, error, data, reset}`. `mutate` resolves with
 * the stored preference, or rejects with a `PreferenceError` when the API refuses the change.
 */
export function useUpdateUserPreference<K extends PreferenceKey>(
  key: K,
  options?: UserPreferenceOptions<K>,
): MutationHookResult<PreferenceEdit<K>, UserPreference<K>> {
  const userId = useSignedInUserId()
  const projectId = useResolvedProjectId({projectId: options?.projectId})
  const organizationId = options?.organizationId
  const {mutate, ...state} = useUpdateUserPreferenceMutation()
  // Depends on the IDs, not `options`, so an inline `options` object keeps the same function
  const update = useCallback(
    (next: PreferenceEdit<K>) =>
      // The project comes from the nearest resource for every key, but only a key stored per
      // project reads it
      mutate({
        userId,
        key,
        value: next,
        projectId,
        organizationId,
      } as UpdateUserPreferenceInput) as Promise<UserPreference<K>>,
    [mutate, userId, key, projectId, organizationId],
  )
  // The registry types each key's value; the mutation holds every key's in one type
  return {...state, data: state.data as UserPreference<K> | undefined, mutate: update}
}
