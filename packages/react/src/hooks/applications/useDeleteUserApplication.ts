import {deleteUserApplication} from '@sanity/sdk'

import {createMutationHook} from '../helpers/createMutationHook'

/**
 * Deletes a user application.
 *
 * @internal
 * @returns The mutation envelope `{mutate, isPending, error, data, reset}`.
 */
export const useDeleteUserApplication = createMutationHook(deleteUserApplication)
