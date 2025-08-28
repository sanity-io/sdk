import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

const projects = createFetcherStore({
  name: 'Projects',
  getKey: (_instance, options?: {organizationId?: string; includeMembers?: boolean}) => {
    const orgKey = options?.organizationId ? `:org:${options.organizationId}` : ''
    const membersKey = options?.includeMembers === false ? ':no-members' : ''
    return `projects${orgKey}${membersKey}`
  },
  fetcher: (instance) => (options?: {organizationId?: string; includeMembers?: boolean}) =>
    getClientState(instance, {
      apiVersion: API_VERSION,
      scope: 'global',
      requestTagPrefix: 'sanity.sdk.projects',
    }).observable.pipe(
      switchMap((client) => {
        const organizationId = options?.organizationId
        return client.observable.projects.list({
          // client method has a type that expects false | undefined
          includeMembers: !options?.includeMembers ? false : undefined,
          organizationId,
        })
      }),
    ),
})

/** @public */
export const getProjectsState = projects.getState
/** @public */
export const resolveProjects = projects.resolveState
