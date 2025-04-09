import {
  getActiveReleasesState,
  getPerspectiveState,
  type PerspectiveHandle,
  type SanityInstance,
} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

export const usePerspective = createStateSourceHook({
  getState: getPerspectiveState,
  shouldSuspend: (instance: SanityInstance, options?: PerspectiveHandle): boolean =>
    getPerspectiveState(instance, options).getCurrent() === undefined,
  suspender: (instance: SanityInstance, _options?: PerspectiveHandle) =>
    firstValueFrom(getActiveReleasesState(instance).observable.pipe(filter(Boolean))),
})
