import {updateApplication} from '@sanity/sdk'

import {createMutationHook} from '../helpers/createMutationHook'

/**
 * Updates an application's mutable properties (title, visibility).
 *
 * @internal
 * @returns The mutation envelope `{mutate, isPending, error, data, reset}`.
 */
export const useUpdateApplication = createMutationHook(updateApplication)
