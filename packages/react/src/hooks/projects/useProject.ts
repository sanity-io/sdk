import {
  getProjectState,
  resolveProject,
  type SanityInstance,
  type SanityProject,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/** @public */
export const useProject = createStateSourceHook({
  // remove `undefined` since we're suspending when that is the case
  getState: getProjectState as (
    instance: SanityInstance,
    projectId: string,
  ) => StateSource<SanityProject>,
  shouldSuspend: (instance, projectId) =>
    getProjectState(instance, projectId).getCurrent() === undefined,
  suspender: resolveProject,
})
