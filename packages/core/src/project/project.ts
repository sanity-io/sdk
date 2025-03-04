import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {createFetcherStore} from '../utils/createFetcherStore'

const project = createFetcherStore({
  name: 'Project',
  getKey: (projectId: string) => projectId,
  fetcher: (instance) => (projectId: string) =>
    getClientState(instance, {apiVersion: 'vX', scope: 'global'}).observable.pipe(
      switchMap((client) => client.observable.projects.getById(projectId)),
    ),
})

/** @public */
export const getProjectState = project.getState
/** @public */
export const resolveProject = project.resolveState
