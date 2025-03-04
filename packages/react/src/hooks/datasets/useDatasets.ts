import {type DatasetsResponse} from '@sanity/client'
import {getDatasetsState, resolveDatasets, type SanityInstance, type StateSource} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/** @public */
export const useDatasets = createStateSourceHook({
  // remove `undefined` since we're suspending when that is the case
  getState: getDatasetsState as (instance: SanityInstance) => StateSource<DatasetsResponse>,
  shouldSuspend: (instance) => getDatasetsState(instance).getCurrent() === undefined,
  suspender: resolveDatasets,
})
