import {getTokenState} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * Hook to get the currently logged in user
 * @internal
 * @returns The current user or null if not authenticated
 */
export const useAuthToken = createStateSourceHook(getTokenState)
