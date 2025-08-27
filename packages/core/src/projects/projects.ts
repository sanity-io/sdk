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
    }).observable.pipe(
      switchMap((client) => {
        const includeMembers = options?.includeMembers ?? true
        // Use conditional logic here because client method has
        // overloaded types that expect literal true/false
        if (includeMembers) {
          return client.observable.projects.list({
            includeMembers: true,
            organizationId: options?.organizationId,
          })
        } else {
          return client.observable.projects.list({
            includeMembers: false,
            organizationId: options?.organizationId,
          })
        }
      }),
    ),
})

/** @public */
export const getProjectsState = projects.getState
/** @public */
export const resolveProjects = projects.resolveState
