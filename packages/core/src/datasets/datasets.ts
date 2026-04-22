import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

/** @public */
export const datasets = createFetcherStore({
  name: 'Datasets',
  getKey: (_instance, options: {projectId: string}) => {
    return options.projectId
  },
  fetcher: (instance) => (options: {projectId: string}) => {
    return getClientState(instance, {
      apiVersion: API_VERSION,
      projectId: options.projectId,
    }).observable.pipe(switchMap((client) => client.observable.datasets.list()))
  },
})

/** @public */
export const getDatasetsState = datasets.getState

/** @public */
export const resolveDatasets = datasets.resolveState
