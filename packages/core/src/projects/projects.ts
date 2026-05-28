import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type Project} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {createFetcherStore} from '../utils/createFetcherStore'

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

const projects = createFetcherStore({
  name: 'Projects',
  getKey: getProjectsCacheKey,
  fetcher: (instance) => (options?: ProjectsOptions<boolean, boolean>) =>
    getClientState(instance, {
      apiVersion: API_VERSION,
      scope: 'global',
    }).observable.pipe(
      switchMap((client) => {
        const normalized = normalizeProjectsOptions(options)
        const query = Object.fromEntries(
          Object.entries(normalized)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        )

        return client.observable.request({
          uri: '/projects',
          query,
          tag: 'projects.get',
        })
      }),
    ),
})

/**
 * Public signature for the projects state source. The conditional generics
 * cannot flow through `BoundStoreAction`, so we declare the signature here
 * and assign the (already-correct) runtime function to it.
 */
type GetProjectsState = <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = true,
>(
  instance: SanityInstance,
  options?: ProjectsOptions<IncludeMembers, IncludeFeatures>,
) => StateSource<Project<IncludeMembers, IncludeFeatures>[] | undefined>

type ResolveProjects = <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = true,
>(
  instance: SanityInstance,
  options?: ProjectsOptions<IncludeMembers, IncludeFeatures>,
) => Promise<Project<IncludeMembers, IncludeFeatures>[]>

/** @public */
export const getProjectsState: GetProjectsState = projects.getState

/** @public */
export const resolveProjects: ResolveProjects = projects.resolveState
