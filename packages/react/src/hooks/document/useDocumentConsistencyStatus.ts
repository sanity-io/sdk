import {getDocumentConsistencyStatus} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

export const useDocumentConsistencyStatus = createStateSourceHook(getDocumentConsistencyStatus)
