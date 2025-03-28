import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ProjectHandle} from '../config/sanityConfig'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

/** @public */
export const datasets = createFetcherStore({
  name: 'Datasets',
  getKey: (instance, options?: ProjectHandle) => {
    const projectId = options?.projectId ?? instance.config.projectId
    if (!projectId) {
      throw new Error('A projectId is required to use the project API.')
    }
    return projectId
  },
  fetcher: (instance) => (options?: ProjectHandle) => {
    return getClientState(instance, {
      apiVersion: API_VERSION,
      // non-null assertion is fine because we check above
      projectId: (options?.projectId ?? instance.config.projectId)!,
      useProjectHostname: true,
    }).observable.pipe(switchMap((client) => client.observable.datasets.list()))
  },
})

/** @public */
export const getDatasetsState = datasets.getState

/** @public */
export const resolveDatasets = datasets.resolveState
