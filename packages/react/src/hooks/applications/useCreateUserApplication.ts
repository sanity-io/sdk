import {createUserApplication} from '@sanity/sdk'

import {createMutationHook} from '../helpers/createMutationHook'

/**
 * Creates a user application.
 *
 * @internal
 * @returns The mutation envelope `{mutate, isPending, error, data, reset}`.
 */
export const useCreateUserApplication = createMutationHook(createUserApplication)
