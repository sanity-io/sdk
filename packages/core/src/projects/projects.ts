import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type Project} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'

const API_VERSION = 'v2025-02-19'

/** @public */
export interface ProjectsOptions<
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = true,
> {
  organizationId?: string
  includeMembers?: IncludeMembers
  includeFeatures?: IncludeFeatures
  onlyExplicitMembership?: boolean
}

function normalizeProjectsOptions(options?: ProjectsOptions<boolean, boolean>) {
  return {
    organizationId: options?.organizationId,
    includeMembers: options?.includeMembers ?? false,
    includeFeatures: options?.includeFeatures ?? true,
    onlyExplicitMembership: options?.onlyExplicitMembership ?? false,
  }
}

/** @internal */
export function getProjectsCacheKey(
  _instance: SanityInstance,
  options?: ProjectsOptions<boolean, boolean>,
): string {
  const {organizationId, includeMembers, includeFeatures, onlyExplicitMembership} =
    normalizeProjectsOptions(options)
  const orgKey = organizationId ? `:org:${organizationId}` : ''
  const membersKey = includeMembers ? ':members' : ''
  const featuresKey = includeFeatures ? ':features' : ''
  const explicitKey = onlyExplicitMembership ? ':explicit' : ''
  return `projects${orgKey}${membersKey}${featuresKey}${explicitKey}`
}

/**
 * Fetcher for the current user's projects (`GET /projects`), on the shared
 * fetcher cache.
 *
 * @internal
 */
export const projects = defineFetcher<
  [options?: ProjectsOptions<boolean, boolean>],
  Project<boolean, boolean>[]
>({
  name: 'projects',
  getKey: getProjectsCacheKey,
  fetch: (instance) => (options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<Project<boolean, boolean>[]>({
          uri: '/projects',
          query: buildQuery(normalizeProjectsOptions(options)),
          tag: 'projects.list',
        }),
      ),
    ),
  tags: (data) => [
    {type: 'project', id: 'LIST'},
    ...data.map((project) => ({type: 'project', id: project.id})),
  ],
})
