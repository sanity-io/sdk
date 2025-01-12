import {mutate} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * Returns a `mutate` function that can be called to submit mutations to
 * content-lake as well as apply them optimistically.
 *
 * @alpha
 */
export const useMutate = createCallbackHook(mutate)
