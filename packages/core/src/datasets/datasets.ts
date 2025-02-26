import {type SanityClient} from '@sanity/client'
import {Observable, switchMap} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createFetcherStore} from '../utils/createFetcherStore'

/** @public */
export const datasets = createFetcherStore({
  name: 'Datasets',
  getKey: () => 'datasets',
  fetcher: (instance) => () =>
    new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: 'v2025-02-19'}).subscribe(observer),
    ).pipe(switchMap((client) => client.observable.datasets.list())),
})

/** @public */
export const getDatasetsState = datasets.getState

/** @public */
export const resolveDatasets = datasets.resolveState
