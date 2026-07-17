import {updateUserApplication} from '@sanity/sdk'

import {createMutationHook} from '../helpers/createMutationHook'

/**
 * Updates a user application.
 *
 * @internal
 * @returns The mutation envelope `{mutate, isPending, error, data, reset}`.
 */
export const useUpdateUserApplication = createMutationHook(updateUserApplication)
