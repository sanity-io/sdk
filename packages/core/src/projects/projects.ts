import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

const projects = createFetcherStore({
  name: 'Projects',
  getKey: () => 'projects',
  fetcher: (instance) => () =>
    getClientState(instance, {
      apiVersion: API_VERSION,
      scope: 'global',
    }).observable.pipe(
      switchMap((client) => client.observable.projects.list({includeMembers: false})),
    ),
})

/** @public */
export const getProjectsState = projects.getState
/** @public */
export const resolveProjects = projects.resolveState
