import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ProjectHandle} from '../config/sanityConfig'
import {createFetcherStore} from '../utils/createFetcherStore'

const project = createFetcherStore({
  name: 'Project',
  getKey: (instance, options?: ProjectHandle) => {
    const projectId = options?.projectId ?? instance.config.projectId
    if (!projectId) {
      throw new Error('A projectId is required to use the project API.')
    }
    return projectId
  },
  fetcher:
    (instance) =>
    ({projectId}: ProjectHandle = {}) =>
      getClientState(instance, {apiVersion: 'vX', scope: 'global'}).observable.pipe(
        switchMap((client) =>
          client.observable.projects.getById(
            // non-null assertion is fine with the above throwing
            (projectId ?? instance.config.projectId)!,
          ),
        ),
      ),
})

/** @public */
export const getProjectState = project.getState
/** @public */
export const resolveProject = project.resolveState
