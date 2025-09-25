import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

type DatasetOptions = {
  projectId: string
}

/** @public */
export const datasets = createFetcherStore({
  name: 'Datasets',
  getKey: (_, {projectId}: DatasetOptions) => projectId,
  fetcher:
    (instance) =>
    ({projectId}: DatasetOptions) => {
      return getClientState(instance, {
        apiVersion: API_VERSION,
        // non-null assertion is fine because we check above
        projectId,
        useProjectHostname: true,
      }).observable.pipe(switchMap((client) => client.observable.datasets.list()))
    },
})

/** @public */
export const getDatasetsState = datasets.getState

/** @public */
export const resolveDatasets = datasets.resolveState
