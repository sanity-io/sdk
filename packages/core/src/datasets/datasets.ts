import {type SanityClient} from '@sanity/client'
import {Observable, switchMap} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createStoreFromObservableFactory} from '../utils/createStoreFromObservableFactory'

/** @public */
export const {getState: getDatasetsState, resolveState: resolveDatasets} =
  createStoreFromObservableFactory({
    name: 'Datasets',
    getKey: () => 'datasets',
    getObservable: (instance) => () =>
      new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion: 'vX'}).subscribe(observer),
      ).pipe(switchMap((client) => client.observable.datasets.list())),
  })
