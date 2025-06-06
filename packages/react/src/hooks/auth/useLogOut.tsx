import {logout} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * Hook to log out of the current session
 * @internal
 * @returns A function to log out of the current session
 */
export const useLogOut = createCallbackHook(logout)
