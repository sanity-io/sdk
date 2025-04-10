import {filter, firstValueFrom} from 'rxjs'

import {type DocumentHandle} from '../config/sanityConfig'
import {bindActionByDataset} from '../store/createActionBinder'
import {getProjectionState} from './getProjectionState'
import {projectionStore} from './projectionStore'
import {type ValidProjection} from './types'

interface ResolveProjectionOptions extends DocumentHandle {
  projection: ValidProjection
}

/**
 * @beta
 */
export const resolveProjection = bindActionByDataset(
  projectionStore,
  ({instance}, {projection, ...docHandle}: ResolveProjectionOptions) =>
    firstValueFrom(
      getProjectionState(instance, {...docHandle, projection}).observable.pipe(
        filter((i) => !!i.data),
      ),
    ),
)
