import {type SanityClient} from '@sanity/client'
import {Observable, switchMap} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createFetcherStore} from '../utils/createFetcherStore'

const project = createFetcherStore({
  name: 'Project',
  getKey: (projectId: string) => projectId,
  fetcher: (instance) => (projectId: string) =>
    new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: 'vX'}).subscribe(observer),
    ).pipe(switchMap((client) => client.observable.projects.getById(projectId))),
})

/** @public */
export const getProjectState = project.getState
/** @public */
export const resolveProject = project.resolveState
