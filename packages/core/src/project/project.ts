import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {getDefaultProjectId, type ProjectHandle} from '../config/sanityConfig'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

const project = createFetcherStore({
  name: 'Project',
  getKey: (instance, options?: ProjectHandle) => {
    const projectId = options?.projectId ?? getDefaultProjectId(instance.config)
    if (!projectId) {
      throw new Error('A projectId is required to use the project API.')
    }
    return projectId
  },
  fetcher:
    (instance) =>
    (options: ProjectHandle = {}) => {
      const projectId = options.projectId ?? getDefaultProjectId(instance.config)

      return getClientState(instance, {
        apiVersion: API_VERSION,
        scope: 'global',
        projectId,
      }).observable.pipe(switchMap((client) => client.observable.projects.getById(projectId!)))
    },
})

/** @public */
export const getProjectState = project.getState
/** @public */
export const resolveProject = project.resolveState
