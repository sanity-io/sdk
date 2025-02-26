import {type SanityClient} from '@sanity/client'
import {Observable, switchMap} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createFetcherStore} from '../utils/createFetcherStore'

const projects = createFetcherStore({
  name: 'Projects',
  getKey: () => 'projects',
  fetcher: (instance) => () =>
    new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: 'vX'}).subscribe(observer),
    ).pipe(switchMap((client) => client.observable.projects.list({includeMembers: false}))),
})

const project = createFetcherStore({
  name: 'Project',
  getKey: (projectId: string) => projectId,
  fetcher: (instance) => (projectId: string) =>
    new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: 'vX'}).subscribe(observer),
    ).pipe(switchMap((client) => client.observable.projects.getById(projectId))),
})

/** @public */
export const getProjectsState = projects.getState
/** @public */
export const resolveProjects = projects.resolveState
/** @public */
export const getProjectState = project.getState
/** @public */
export const resolveProject = project.resolveState
