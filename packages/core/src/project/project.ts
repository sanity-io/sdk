import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ProjectHandle} from '../config/sanityConfig'
import {projects} from '../projects/projects'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'

const API_VERSION = 'v2025-02-19'

/** @public */
export interface ProjectMemberRole {
  name: string
  title: string
  description: string
}

/** @public */
export interface ProjectMember {
  id: string
  createdAt: string
  updatedAt: string
  isCurrentUser: boolean
  isRobot: boolean
  roles: ProjectMemberRole[]
}

/** @public */
export interface ProjectMetadata {
  color?: string
  externalStudioHost?: string
  initialTemplate?: string
  cliInitializedAt?: string
  integration: 'manage' | 'cli'
}

/**
 * The base fields returned from `/projects` for every project.
 * @public
 */
export interface ProjectBase {
  id: string
  displayName: string
  studioHost: string | null
  organizationId: string
  metadata: ProjectMetadata
  isBlocked: boolean
  isDisabled: boolean
  isDisabledByUser: boolean
  activityFeedEnabled: boolean
  createdAt: string
  updatedAt: string
}

/**
 * A `Project` with `members` and/or `features` conditionally included
 * based on the query options used to fetch it.
 * @public
 */
export type Project<
  IncludeMembers extends boolean = true,
  IncludeFeatures extends boolean = true,
> = ProjectBase &
  // `boolean extends T` is non-distributive — true only when T is the wide
  // `boolean`, in which case the field is optional. Literal `true`/`false`
  // fall through to the strict branch.
  (boolean extends IncludeMembers
    ? {members?: ProjectMember[]}
    : IncludeMembers extends true
      ? {members: ProjectMember[]}
      : unknown) &
  (boolean extends IncludeFeatures
    ? {features?: string[]}
    : IncludeFeatures extends true
      ? {features: string[]}
      : unknown)

/** @public */
export interface ProjectOptions<
  IncludeMembers extends boolean = true,
  IncludeFeatures extends boolean = true,
> extends ProjectHandle {
  includeMembers?: IncludeMembers
  includeFeatures?: IncludeFeatures
}

function normalizeProjectOptions(options?: ProjectOptions<boolean, boolean>) {
  return {
    includeMembers: options?.includeMembers ?? true,
    includeFeatures: options?.includeFeatures ?? true,
  }
}

function resolveProjectId(instance: SanityInstance, options?: ProjectOptions<boolean, boolean>) {
  const projectId = options?.projectId ?? instance.config.projectId
  if (!projectId) {
    throw new Error('A projectId is required to use the project API.')
  }
  return projectId
}

/** @internal */
export function getProjectCacheKey(
  instance: SanityInstance,
  options?: ProjectOptions<boolean, boolean>,
): string {
  const projectId = resolveProjectId(instance, options)
  const {includeMembers, includeFeatures} = normalizeProjectOptions(options)
  const membersKey = includeMembers ? ':members' : ''
  const featuresKey = includeFeatures ? ':features' : ''
  return `project:${projectId}${membersKey}${featuresKey}`
}

/**
 * Fetcher for a single project (`GET /projects/:id`), on the shared fetcher
 * cache. Pre-seeds from the default {@link projects} list entry when it can
 * satisfy the read — the default list carries features but not members, so
 * only `includeMembers: false` reads seed.
 *
 * @internal
 */
export const project = defineFetcher<
  [options?: ProjectOptions<boolean, boolean>],
  Project<boolean, boolean>
>({
  name: 'project',
  getKey: getProjectCacheKey,
  fetch: (instance) => (options) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<Project<boolean, boolean>>({
          uri: `/projects/${resolveProjectId(instance, options)}`,
          query: buildQuery(normalizeProjectOptions(options)),
          tag: 'projects.get',
        }),
      ),
    ),
  tags: (data) => [{type: 'project', id: data.id}],
  initialData: (instance, options) => {
    if (normalizeProjectOptions(options).includeMembers) return undefined
    const snapshot = projects.getState(instance).getCurrent()
    if (snapshot.status !== 'success') return undefined
    const projectId = resolveProjectId(instance, options)
    const match = snapshot.data.find((item) => item.id === projectId)
    return match && {data: match, dataUpdatedAt: snapshot.dataUpdatedAt}
  },
})
