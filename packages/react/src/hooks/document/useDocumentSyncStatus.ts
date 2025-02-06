import {getDocumentSyncStatus} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

export const useDocumentSyncStatus = createStateSourceHook(getDocumentSyncStatus)
