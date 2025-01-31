import {applyActions} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

export const useApplyActions = createCallbackHook(applyActions)
