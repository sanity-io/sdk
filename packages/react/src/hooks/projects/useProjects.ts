import {
  getProjectsState,
  resolveProjects,
  type SanityInstance,
  type SanityProject,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

export const useProjects = createStateSourceHook({
  // remove `undefined` since we're suspending when that is the case
  getState: getProjectsState as (
    instance: SanityInstance,
  ) => StateSource<Omit<SanityProject, 'members'>[]>,
  shouldSuspend: (instance) => getProjectsState(instance).getCurrent() === undefined,
  suspender: resolveProjects,
})
