import {getDocumentSyncStatus} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/** @beta */
export const useDocumentSyncStatus = createStateSourceHook(getDocumentSyncStatus)
