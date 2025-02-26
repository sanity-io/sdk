import {type SanityClient} from '@sanity/client'
import {Observable, switchMap} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createStoreFromObservableFactory} from '../utils/createStoreFromObservableFactory'

/** @public */
export const {getState: getProjectsState, resolveState: resolveProjects} =
  createStoreFromObservableFactory({
    name: 'Projects',
    getKey: () => 'projects',
    getObservable: (instance) => () =>
      new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion: 'vX'}).subscribe(observer),
      ).pipe(switchMap((client) => client.observable.projects.list({includeMembers: false}))),
  })

/** @public */
export const {getState: getProjectState, resolveState: resolveProject} =
  createStoreFromObservableFactory({
    name: 'Project',
    getKey: (projectId: string) => projectId,
    getObservable: (instance) => (projectId: string) =>
      new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion: 'vX'}).subscribe(observer),
      ).pipe(switchMap((client) => client.observable.projects.getById(projectId))),
  })
