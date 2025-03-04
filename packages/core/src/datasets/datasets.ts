import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {createFetcherStore} from '../utils/createFetcherStore'

/** @public */
export const datasets = createFetcherStore({
  name: 'Datasets',
  getKey: () => 'datasets',
  fetcher: (instance) => () =>
    getClientState(instance, {apiVersion: 'vX', scope: 'project'}).observable.pipe(
      switchMap((client) => client.observable.datasets.list()),
    ),
})

/** @public */
export const getDatasetsState = datasets.getState

/** @public */
export const resolveDatasets = datasets.resolveState
