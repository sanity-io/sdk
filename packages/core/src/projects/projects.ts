import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {createFetcherStore} from '../utils/createFetcherStore'

const projects = createFetcherStore({
  name: 'Projects',
  getKey: () => 'projects',
  fetcher: (instance) => () =>
    getClientState(instance, {
      apiVersion: 'vX',
      scope: 'global',
      requestTagPrefix: undefined,
    }).observable.pipe(
      switchMap((client) => client.observable.projects.list({includeMembers: false})),
    ),
})

/** @public */
export const getProjectsState = projects.getState
/** @public */
export const resolveProjects = projects.resolveState
