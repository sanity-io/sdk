import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

type ProjectOptions = {
  projectId: string
}

const project = createFetcherStore({
  name: 'Project',
  getKey: (_, {projectId}: ProjectOptions) => projectId,
  fetcher:
    (instance) =>
    ({projectId}: ProjectOptions) => {
      return getClientState(instance, {
        apiVersion: API_VERSION,
        scope: 'global',
        projectId,
      }).observable.pipe(switchMap((client) => client.observable.projects.getById(projectId)))
    },
})

/** @public */
export const getProjectState = project.getState
/** @public */
export const resolveProject = project.resolveState
